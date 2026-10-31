package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/meshwork-studio/auth/internal/assertion"
	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

type cognitoState struct {
	ReturnTo   string `json:"returnTo"`
	Verifier   string `json:"verifier"`
	LinkUserID string `json:"linkUserId,omitempty"`
}

func (s *Server) handleAuthProviders(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"cognito": s.cognitoCfg != nil, "google": s.oauthCfg != nil})
}

func (s *Server) handleCognitoStart(w http.ResponseWriter, r *http.Request) {
	if s.cognitoCfg == nil || s.rdb == nil {
		writeError(w, r, http.StatusServiceUnavailable, "OAUTH_UNAVAILABLE", "Sign-in temporarily unavailable")
		return
	}
	state, err := randomToken()
	if err != nil {
		s.writeInternal(w, r, err, "Sign-in unavailable")
		return
	}
	browser, err := randomToken()
	if err != nil {
		s.writeInternal(w, r, err, "Sign-in unavailable")
		return
	}
	payload := cognitoState{ReturnTo: safeReturnTo(r.URL.Query().Get("returnTo")), Verifier: oauth2.GenerateVerifier()}
	if r.URL.Query().Get("link") == "true" {
		rec, err := s.sessions.Validate(r.Context(), s.legacySessionRaw(r))
		if err != nil {
			writeError(w, r, http.StatusUnauthorized, "NO_SESSION", "Log in to your existing account before linking.")
			return
		}
		payload.LinkUserID = rec.UserID
	}
	data, _ := json.Marshal(payload)
	if err := s.rdb.Set(r.Context(), "cognito:state:"+state+":"+session.HashToken(browser), data, oauthStateTTL).Err(); err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "OAUTH_UNAVAILABLE", "Sign-in temporarily unavailable")
		return
	}
	setCookie(w, s.cfg, s.cfg.PKCECookieName+"_cognito", browser, oauthStateTTL, true)
	http.Redirect(w, r, s.cognitoCfg.AuthCodeURL(state, oauth2.S256ChallengeOption(payload.Verifier)), http.StatusFound)
}

type cognitoUserInfo struct {
	Sub       string          `json:"sub"`
	Email     string          `json:"email"`
	Verified  json.RawMessage `json:"email_verified"`
	FirstName *string         `json:"given_name"`
	LastName  *string         `json:"family_name"`
}

func (u cognitoUserInfo) valid() bool {
	// Cognito's userInfo endpoint returns verification as a string; accept
	// the standards-compatible boolean too, but never a truthy arbitrary value.
	verified := string(u.Verified) == `"true"` || string(u.Verified) == "true"
	return u.Sub != "" && len(u.Sub) <= 128 && validateEmail(u.Email) && verified
}

func (s *Server) handleCognitoCallback(w http.ResponseWriter, r *http.Request) {
	fail := func() { http.Redirect(w, r, s.cfg.PublicURL+"/login?error=cognito", http.StatusFound) }
	if s.cognitoCfg == nil || s.rdb == nil {
		fail()
		return
	}
	browser := cookieValue(r, s.cfg.PKCECookieName+"_cognito")
	clearCookie(w, s.cfg.PKCECookieName+"_cognito")
	state, code := r.URL.Query().Get("state"), r.URL.Query().Get("code")
	if browser == "" || state == "" || code == "" || len(state) > 128 || r.URL.Query().Get("error") != "" {
		fail()
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	raw, err := s.rdb.GetDel(ctx, "cognito:state:"+state+":"+session.HashToken(browser)).Result()
	var payload cognitoState
	if err != nil || json.Unmarshal([]byte(raw), &payload) != nil || payload.Verifier == "" {
		fail()
		return
	}
	// Fixed endpoints, no redirect following, no access/ID/refresh tokens in browser storage.
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, client)
	token, err := s.cognitoCfg.Exchange(ctx, code, oauth2.VerifierOption(payload.Verifier))
	if err != nil {
		s.log.Warn("cognito token exchange failed", "request_id", requestIDFrom(r))
		fail()
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.CognitoDomain+"/oauth2/userInfo", nil)
	if err != nil {
		fail()
		return
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	resp, err := client.Do(req)
	if err != nil {
		fail()
		return
	}
	defer func() { _ = resp.Body.Close() }()
	var info cognitoUserInfo
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&info) != nil || !info.valid() {
		fail()
		return
	}
	if payload.LinkUserID != "" {
		current, err := s.sessions.Validate(ctx, s.legacySessionRaw(r))
		if err != nil || current.UserID != payload.LinkUserID {
			fail()
			return
		}
	}
	user, err := s.db.ResolveCognitoIdentity(ctx, s.cfg.CognitoPoolID+":"+info.Sub, normalizeEmail(info.Email), info.FirstName, info.LastName, payload.LinkUserID)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			http.Redirect(w, r, s.cfg.PublicURL+"/login?error=cognito_link_required", http.StatusFound)
			return
		}
		s.log.Warn("cognito identity could not be resolved", "request_id", requestIDFrom(r))
		fail()
		return
	}
	rec, cookie, err := s.sessions.Rotate(ctx, s.legacySessionRaw(r), session.CreateInput{UserID: user.ID, UserAgent: uaPtr(r), IPHash: ipHashPtr(s, r)})
	if err != nil {
		fail()
		return
	}
	// A local sliding session may not outlive the upstream access token. Local
	// revocation remains authoritative; Cognito disable takes effect on reauth.
	limit := time.Now().Add(15 * time.Minute)
	if !token.Expiry.IsZero() && token.Expiry.Before(limit) {
		limit = token.Expiry
	}
	if err := s.sessions.CapExpiry(ctx, rec, limit); err != nil {
		_ = s.sessions.Revoke(ctx, cookie)
		fail()
		return
	}
	s.setSessionCookie(w, cookie)
	s.issueAssertion(w, assertion.Identity{UserID: user.ID, SessionIDHash: rec.IDHash, Admin: user.IsAdmin, Email: user.Email, Name: displayName(user)})
	s.auditor.Record(s.auditEntry(r, user.ID, user.Email, audit.OAuthLogin))
	destination := safeReturnTo(payload.ReturnTo)
	if strings.HasPrefix(destination, "/api/") {
		destination = "/home"
	}
	http.Redirect(w, r, s.cfg.PublicURL+destination, http.StatusFound)
}
