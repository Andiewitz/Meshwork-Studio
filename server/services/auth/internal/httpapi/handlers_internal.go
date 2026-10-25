package httpapi

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"time"

	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

// internalKeyMatches is a constant-time comparison of the shared secret
// used for server-to-server calls (monolith → auth introspection).
func internalKeyMatches(presented string) bool {
	expected := internalKeyValue
	if expected == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(presented), []byte(expected)) == 1
}

type introspectBody struct {
	Token string `json:"token"`
}

type introspectResponse struct {
	Active    bool   `json:"active"`
	Sub       string `json:"sub"`
	Sid       string `json:"sid"`
	Adm       bool   `json:"adm"`
	Eml       string `json:"eml"`
	Nam       string `json:"nam"`
	Assertion string `json:"assertion"` // freshly signed, ready to Set-Cookie
}

// handleIntrospect lets the Node monolith validate an opaque session token
// when its local assertion is missing/expired. It is server-to-server only:
// protected by the shared AUTH_INTERNAL_KEY, never exposed through NGINX.
//
// Response includes a freshly signed assertion so the monolith can hand a
// new cookie straight back to the browser, closing the loop without the
// client ever noticing the refresh happened.
func (s *Server) handleIntrospect(w http.ResponseWriter, r *http.Request) {
	if !internalKeyMatches(r.Header.Get("X-Internal-Key")) {
		writeError(w, r, http.StatusUnauthorized, "INTERNAL_AUTH", "Invalid internal key")
		return
	}

	var body introspectBody
	if err := readJSON(r, &body); err != nil || len(body.Token) < 16 || len(body.Token) > 512 {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "Token required")
		return
	}

	rec, err := s.sessions.Validate(r.Context(), body.Token)
	if err != nil {
		if !errors.Is(err, session.ErrInvalidSession) {
			s.log.Error("introspect unavailable: session validation failed",
				"request_id", requestIDFrom(r), "err", err)
			writeError(w, r, http.StatusServiceUnavailable,
				"AUTH_SERVICE_UNAVAILABLE", "Authentication temporarily unavailable")
			return
		}
		s.log.Info("introspect inactive: session invalid",
			"request_id", requestIDFrom(r), "err", err)
		writeJSON(w, http.StatusOK, map[string]any{"active": false, "reason": "session_invalid"})
		return
	}
	user, err := s.db.FindUserByID(r.Context(), rec.UserID)
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			s.log.Error("introspect unavailable: user lookup failed",
				"request_id", requestIDFrom(r), "err", err)
			writeError(w, r, http.StatusServiceUnavailable,
				"AUTH_SERVICE_UNAVAILABLE", "Authentication temporarily unavailable")
			return
		}
		s.log.Warn("introspect inactive: user missing",
			"request_id", requestIDFrom(r), "err", err)
		writeJSON(w, http.StatusOK, map[string]any{"active": false, "reason": "user_missing"})
		return
	}

	assertion := ""
	if s.assert != nil {
		tok, serr := s.assert.Sign(assertionIdentity(user, rec.IDHash), time.Now())
		if serr == nil {
			assertion = tok
		}
	}

	writeJSON(w, http.StatusOK, introspectResponse{
		Active:    true,
		Sub:       user.ID,
		Sid:       rec.IDHash,
		Adm:       user.IsAdmin,
		Eml:       user.Email,
		Nam:       displayName(user),
		Assertion: assertion,
	})
}
