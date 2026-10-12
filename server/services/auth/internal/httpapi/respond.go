package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/config"
)

// ─── Responses ──────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"code":      code,
		"message":   message,
		"requestId": requestIDFrom(r),
	})
}

func readJSON(r *http.Request, dst any) error {
	defer func() { _ = r.Body.Close() }()
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20) // 1 MiB cap
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

// routeTemplate masks IDs in metrics labels to bound cardinality.
func routeTemplate(r *http.Request) string {
	p := r.URL.Path
	for _, seg := range []string{"/sessions/", "/google/"} {
		if i := strings.Index(p, seg); i >= 0 {
			return p[:i+len(seg)] + ":id"
		}
	}
	return p
}

// ─── Cookies ────────────────────────────────────────────────────────────────

func setCookie(w http.ResponseWriter, cfg *config.Config, name, value string, maxAge time.Duration, httpOnly bool) {
	// #nosec G124 -- Secure is required by production config; only the CSRF cookie is intentionally JS-readable.
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   int(maxAge.Seconds()),
		HttpOnly: httpOnly,
		Secure:   cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// legacySessionRaw returns the session token from any accepted cookie name
// so the cutover window honours pre-existing cookies.
func (s *Server) legacySessionRaw(r *http.Request) string { return s.sessionCookieValue(r) }

func (s *Server) setSessionCookie(w http.ResponseWriter, rawToken string) {
	setCookie(w, s.cfg, s.cfg.SessionCookieName, rawToken, s.cfg.AbsoluteTTL, true)
}

func (s *Server) clearSessionCookies(w http.ResponseWriter) {
	clearCookie(w, s.cfg.SessionCookieName)
	clearCookie(w, "__Host-meshwork_session")
	clearCookie(w, "meshwork_session")
	clearCookie(w, s.cfg.MFACookieName)
}

func cookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}

// ─── Audit ──────────────────────────────────────────────────────────────────

func (s *Server) auditEntry(r *http.Request, userID, email string, event audit.Event) audit.Entry {
	ipHash := ""
	if ip := clientIPFrom(r); ip != "" {
		ipHash = s.ipHasher.Hash(ip)
	}
	return audit.Entry{
		UserID:    userID,
		Email:     email,
		Event:     event,
		IPHash:    ipHash,
		UserAgent: r.UserAgent(),
		RequestID: requestIDFrom(r),
	}
}
