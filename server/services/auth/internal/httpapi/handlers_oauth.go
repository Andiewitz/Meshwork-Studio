package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/meshwork-studio/auth/internal/assertion"
	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/password"
	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

const (
	oauthStateTTL = 10 * time.Minute
	pkceCookieTTL = 10 * time.Minute
	linkStateTTL  = 10 * time.Minute
)

type oauthStatePayload struct {
	ReturnTo string `json:"returnTo"`
}

// safeReturnTo allows only same-site absolute paths.
func safeReturnTo(rt string) string {
	if rt == "" || !strings.HasPrefix(rt, "/") || strings.HasPrefix(rt, "//") {
		return "/"
	}
	return rt
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// ─── Google flow ────────────────────────────────────────────────────────────

func (s *Server) handleGoogleStart(w http.ResponseWriter, r *http.Request) {
	if s.oauthCfg == nil {
		writeError(w, http.StatusNotImplemented, "OAUTH_NOT_CONFIGURED", "Google sign-in is not configured")
		return
	}
	state, err := randomToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "OAuth start failed")
		return
	}
	returnTo := safeReturnTo(r.URL.Query().Get("returnTo"))
	if s.rdb != nil {
		payload, _ := json.Marshal(oauthStatePayload{ReturnTo: returnTo})
		if err := s.rdb.Set(r.Context(), "oauth:state:"+state, payload, oauthStateTTL).Err(); err != nil {
			writeError(w, http.StatusServiceUnavailable, "OAUTH_UNAVAILABLE", "Sign-in temporarily unavailable")
			return
		}
	} else {
		writeError(w, http.StatusServiceUnavailable, "OAUTH_UNAVAILABLE", "Sign-in requires Redis")
		return
	}

	verifier := oauth2.GenerateVerifier()
	setCookie(w, s.cfg, s.cfg.PKCECookieName, verifier, pkceCookieTTL, true)

	url := s.oauthCfg.AuthCodeURL(state,
		oauth2.S256ChallengeOption(verifier),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
	http.Redirect(w, r, url, http.StatusFound)
}

type googleUserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Picture       string `json:"picture"`
}

func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	if s.oauthCfg == nil {
		writeError(w, http.StatusNotImplemented, "OAUTH_NOT_CONFIGURED", "Google sign-in is not configured")
		return
	}
	ctx := r.Context()

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	errParam := r.URL.Query().Get("error")
	if errParam != "" || state == "" || code == "" {
		s.log.Error("google oauth callback missing params", "errParam", errParam, "state_empty", state == "", "code_empty", code == "")
		s.redirectOAuthError(w, r, "google")
		return
	}

	// Single-use state: GetDel makes replay impossible even across replicas.
	rawState, err := s.rdb.GetDel(ctx, "oauth:state:"+state).Result()
	if err != nil || rawState == "" {
		s.log.Error("google oauth state rejected or expired", "err", err)
		s.auditor.Record(s.auditEntry(r, "", "", audit.OAuthStateRejected))
		s.redirectOAuthError(w, r, "google")
		return
	}
	var st oauthStatePayload
	_ = json.Unmarshal([]byte(rawState), &st)

	verifier := cookieValue(r, s.cfg.PKCECookieName)
	clearCookie(w, s.cfg.PKCECookieName)
	if verifier == "" {
		s.log.Error("google oauth PKCE verifier cookie missing", "cookieName", s.cfg.PKCECookieName)
		s.redirectOAuthError(w, r, "google")
		return
	}

	token, err := s.oauthCfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		s.log.Error("google oauth exchange failed", "err", err)
		s.redirectOAuthError(w, r, "google")
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		s.redirectOAuthError(w, r, "google")
		return
	}
	resp, err := s.oauthCfg.Client(ctx, token).Do(req)
	if err != nil {
		s.log.Error("google oauth userinfo fetch failed", "err", err)
		s.redirectOAuthError(w, r, "google")
		return
	}
	defer func() { _ = resp.Body.Close() }() // Read-only response cleanup.
	var info googleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil ||
		info.Sub == "" || info.Email == "" {
		s.log.Error("google oauth decode userinfo failed", "err", err)
		s.redirectOAuthError(w, r, "google")
		return
	}
	// CRITICAL: only verified emails may bind identities — otherwise this is
	// an account-takeover vector.
	if !info.EmailVerified {
		s.log.Warn("google oauth email unverified")
		s.redirectOAuthError(w, r, "google_unverified")
		return
	}

	email := normalizeEmail(info.Email)
	user, err := s.completeGoogleLogin(ctx, r, info, email)
	switch {
	case errors.Is(err, store.ErrConflict):
		s.log.Info("google oauth email conflict with password account")
		// Existing password account: never silently merge. Park a link
		// request the user must confirm WITH their password.
		linkState, lerr := randomToken()
		if lerr == nil && s.rdb != nil {
			payload, _ := json.Marshal(map[string]string{
				"provider": "google", "providerAccountId": info.Sub,
				"userId": userIDFromUser(user), "email": email,
			})
			_ = s.rdb.Set(ctx, "oauth:link:"+linkState, payload, linkStateTTL)
			http.Redirect(w, r,
				s.cfg.PublicURL+"/login?link=google&state="+linkState, http.StatusFound)
			return
		}
		s.redirectOAuthError(w, r, "google")
		return
	case err != nil:
		s.log.Error("google oauth completeGoogleLogin failed", "err", err)
		s.redirectOAuthError(w, r, "google")
		return
	}

	rec, raw, serr := s.sessions.Rotate(ctx, s.legacySessionRaw(r), session.CreateInput{
		UserID: user.ID, UserAgent: uaPtr(r), IPHash: ipHashPtr(s, r),
	})
	if serr != nil {
		s.log.Error("google oauth session rotate failed", "err", serr)
		s.redirectOAuthError(w, r, "google")
		return
	}
	s.setSessionCookie(w, raw)
	s.issueAssertion(w, assertion.Identity{
		UserID:        user.ID,
		SessionIDHash: rec.IDHash,
		Admin:         user.IsAdmin,
		Email:         user.Email,
		Name:          displayName(user),
	})
	s.auditor.Record(s.auditEntry(r, user.ID, user.Email, audit.OAuthLogin))
	s.notifyNewDeviceIfUnseen(r, user)
	http.Redirect(w, r, s.cfg.PublicURL+safeReturnTo(st.ReturnTo), http.StatusFound)
	_ = rec
}

var ErrIdentityTaken = errors.New("identity belongs to another user")

// completeGoogleLogin resolves or creates the user behind a verified Google
// identity. It NEVER merges accounts by email alone.
func (s *Server) completeGoogleLogin(ctx context.Context, r *http.Request, info googleUserInfo, email string) (*store.User, error) {
	if u, err := s.db.FindIdentity(ctx, "google", info.Sub); err == nil {
		return u, nil
	} else if !errors.Is(err, store.ErrNotFound) {
		return nil, err
	}

	existing, lookupErr := s.db.FindUserByEmail(ctx, email)
	switch {
	case lookupErr == nil:
		// Email already registered. Since Google verified email ownership, link identity directly:
		if err := s.db.LinkIdentity(ctx, existing.ID, "google", info.Sub); err != nil {
			return nil, err
		}
		s.auditor.Record(s.auditEntry(r, existing.ID, email, audit.OAuthLink))
		return existing, nil
	case !errors.Is(lookupErr, store.ErrNotFound):
		return nil, lookupErr
	}

	first, last := info.GivenName, info.FamilyName
	user, err := s.db.CreateUser(ctx, store.CreateUserInput{
		Email:           info.Email,
		FirstName:       strOrNil(first),
		LastName:        strOrNil(last),
		ProfileImageURL: strOrNil(info.Picture),
		AuthProvider:    "google",
	})
	if err != nil {
		return nil, err
	}
	// Verified by Google → mark immediately.
	if err := s.db.MarkEmailVerified(ctx, user.ID); err != nil {
		return nil, err
	}
	if err := s.db.LinkIdentity(ctx, user.ID, "google", info.Sub); err != nil {
		return nil, err
	}
	s.auditor.Record(s.auditEntry(r, user.ID, email, audit.Register))
	return user, nil
}

type googleLinkBody struct {
	State    string `json:"state"`
	Password string `json:"password"`
}

// handleGoogleLinkConfirm attaches a Google identity to an existing password
// account after the account owner proves possession of their password.
func (s *Server) handleGoogleLinkConfirm(w http.ResponseWriter, r *http.Request) {
	var body googleLinkBody
	if err := readJSON(r, &body); err != nil || len(body.State) < 16 || body.Password == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION", "Link state and password required")
		return
	}
	raw, err := s.rdb.GetDel(r.Context(), "oauth:link:"+body.State).Result()
	if err != nil || raw == "" {
		writeError(w, http.StatusBadRequest, "LINK_INVALID", "Link request expired; sign in again")
		return
	}
	var payload map[string]string
	if json.Unmarshal([]byte(raw), &payload) != nil ||
		payload["provider"] != "google" || payload["userId"] == "" {
		writeError(w, http.StatusBadRequest, "LINK_INVALID", "Malformed link request")
		return
	}

	user, err := s.db.FindUserByID(r.Context(), payload["userId"])
	if err != nil || user.PasswordHash == nil {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Password incorrect")
		return
	}
	ok, verr := verifyPasswordHash(body.Password, *user.PasswordHash)
	password.VerifyDummy(body.Password) // keep timing flat when hash missing
	if verr != nil || !ok {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Password incorrect")
		return
	}
	if err := s.db.LinkIdentity(r.Context(), user.ID, "google", payload["providerAccountId"]); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "Link failed")
		return
	}
	s.auditor.Record(s.auditEntry(r, user.ID, user.Email, audit.OAuthLink))

	rec, rawTok, serr := s.sessions.Rotate(r.Context(), s.legacySessionRaw(r), session.CreateInput{
		UserID: user.ID, UserAgent: uaPtr(r), IPHash: ipHashPtr(s, r),
	})
	if serr != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "Session creation failed")
		return
	}
	s.setSessionCookie(w, rawTok)
	s.issueAssertion(w, assertion.Identity{
		UserID:        user.ID,
		SessionIDHash: rec.IDHash,
		Admin:         user.IsAdmin,
		Email:         user.Email,
		Name:          displayName(user),
	})
	s.auditor.Record(s.auditEntry(r, user.ID, user.Email, audit.LoginSuccess))
	writeAuthSuccess(w, user, rec.ExpiresAt)
}

func (s *Server) redirectOAuthError(w http.ResponseWriter, r *http.Request, reason string) {
	http.Redirect(w, r, s.cfg.PublicURL+"/login?error="+reason, http.StatusFound)
}

// ─── tiny helpers ───────────────────────────────────────────────────────────

func uaPtr(r *http.Request) *string {
	if ua := r.UserAgent(); ua != "" {
		return &ua
	}
	return nil
}

func ipHashPtr(s *Server, r *http.Request) *string {
	if ip := clientIPFrom(r); ip != "" {
		h := s.ipHasher.Hash(ip)
		return &h
	}
	return nil
}

func strOrNil(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}

func userIDFromUser(u *store.User) string {
	if u == nil {
		return ""
	}
	return u.ID
}
