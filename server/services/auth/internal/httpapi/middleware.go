package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/csrf"
	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

// ─── Context ────────────────────────────────────────────────────────────────

type ctxKey int

const (
	ctxAuth ctxKey = iota
	ctxClientIP
	ctxRequestID
)

type AuthInfo struct {
	User     *store.User
	Session  *session.Record
	RawToken string
}

func authFrom(r *http.Request) *AuthInfo {
	if v, ok := r.Context().Value(ctxAuth).(*AuthInfo); ok {
		return v
	}
	return nil
}

func clientIPFrom(r *http.Request) string {
	if v, ok := r.Context().Value(ctxClientIP).(string); ok {
		return v
	}
	return ""
}

// requestIDFrom returns the ID minted (or adopted) by requestIDMiddleware.
// Falls back to "unscoped" for background work with no inbound request so
// every log line and error body carries a joinable value.
func requestIDFrom(r *http.Request) string {
	if r == nil {
		return "unscoped"
	}
	if v, ok := r.Context().Value(ctxRequestID).(string); ok && v != "" {
		return v
	}
	return "unscoped"
}

// ─── Base middleware ────────────────────────────────────────────────────────

func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" {
			b := make([]byte, 12)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
		}
		w.Header().Set("X-Request-Id", id)
		r.Header.Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxRequestID, id)))
	})
}

// realIPMiddleware resolves the client IP honouring X-Forwarded-For only from
// explicitly trusted proxy CIDRs — spoofable headers never decide identity.
func realIPMiddleware(trustedCIDRs []string) func(http.Handler) http.Handler {
	cidrs := parseCIDRs(trustedCIDRs)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			remote := remoteAddrIP(r)
			ip := remote
			if trustedProxyAllowed(remote, cidrs) {
				if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
					parts := strings.Split(xff, ",")
					// Walk right-to-left; first untrusted hop wins.
					for i := len(parts) - 1; i >= 0; i-- {
						cand := strings.TrimSpace(parts[i])
						parsed := net.ParseIP(cand)
						if parsed == nil {
							break
						}
						if !trustedProxyAllowed(parsed, cidrs) || i == 0 {
							ip = parsed
							break
						}
					}
				}
			}
			next.ServeHTTP(w, r.WithContext(
				context.WithValue(r.Context(), ctxClientIP, ip.String())))
		})
	}
}

func recoverMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					// Frames only — never variable values (may hold secrets).
					// request_id joins this to the client's support ID.
					log.Error("panic recovered",
						"panic", rec,
						"path", r.URL.Path,
						"request_id", requestIDFrom(r),
						"stack", string(debug.Stack()))
					writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Internal error")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

var (
	httpDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "identity_http_duration_seconds",
		Help:    "Latency of identity HTTP requests",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "route", "status"})

	cacheHits = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "identity_session_cache_hits_total",
	})
	cacheMisses = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "identity_session_cache_misses_total",
	})
)

func init() {
	prometheus.MustRegister(httpDuration, cacheHits, cacheMisses)
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (s *Server) metricsMiddleware(next http.Handler) http.Handler {
	s.sessions.SetMetricsHooks(func() { cacheHits.Inc() }, func() { cacheMisses.Inc() })
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		httpDuration.WithLabelValues(r.Method, routeTemplate(r), strconv.Itoa(rec.status)).
			Observe(time.Since(start).Seconds())
	})
}

// ─── Auth middleware ────────────────────────────────────────────────────────

func (s *Server) sessionCookieValue(r *http.Request) string {
	for _, name := range []string{s.cfg.SessionCookieName, "__Host-meshwork_session", "meshwork_session"} {
		if c, err := r.Cookie(name); err == nil && c.Value != "" {
			return c.Value
		}
	}
	return ""
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := s.sessionCookieValue(r)
		if raw == "" {
			writeError(w, r, http.StatusUnauthorized, "NO_SESSION", "Authentication required")
			return
		}
		rec, err := s.sessions.Validate(r.Context(), raw)
		if err != nil {
			if !errors.Is(err, session.ErrInvalidSession) {
				s.log.Error("session validation unavailable",
					"request_id", requestIDFrom(r), "err", err)
				writeError(w, r, http.StatusServiceUnavailable,
					"AUTH_SERVICE_UNAVAILABLE", "Authentication temporarily unavailable")
				return
			}
			writeError(w, r, http.StatusUnauthorized, "SESSION_EXPIRED",
				"Session expired or invalid. Please log in again.")
			return
		}
		user, err := s.db.FindUserByID(r.Context(), rec.UserID)
		if err != nil {
			if !errors.Is(err, store.ErrNotFound) {
				s.log.Error("user lookup unavailable",
					"request_id", requestIDFrom(r), "err", err)
				writeError(w, r, http.StatusServiceUnavailable,
					"AUTH_SERVICE_UNAVAILABLE", "Authentication temporarily unavailable")
				return
			}
			writeError(w, r, http.StatusUnauthorized, "SESSION_EXPIRED", "Account unavailable")
			return
		}
		info := &AuthInfo{User: user, Session: rec, RawToken: raw}
		s.refreshAssertion(w, r) // keep the monolith-side token fresh
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxAuth, info)))
	})
}

// requireMFATicket validates the short-lived post-password MFA ticket cookie.
const mfaTicketPrefix = "mfa:ticket:"

func (s *Server) requireMFATicket(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(s.cfg.MFACookieName)
		if err != nil || c.Value == "" || s.rdb == nil {
			writeError(w, r, http.StatusUnauthorized, "MFA_TICKET_REQUIRED", "Complete password step first")
			return
		}
		val, err := s.rdb.GetDel(r.Context(), mfaTicketPrefix+csrf.HashForLookup(c.Value)).Result()
		if err != nil || val == "" {
			clearCookie(w, s.cfg.MFACookieName)
			writeError(w, r, http.StatusUnauthorized, "MFA_TICKET_INVALID", "Verification window expired, log in again")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), mfaTicketUserKey{}, val)))
	})
}

type mfaTicketUserKey struct{}

// ─── CSRF ───────────────────────────────────────────────────────────────────

func mutating(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

func (s *Server) csrfProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !mutating(r.Method) {
			next.ServeHTTP(w, r)
			return
		}
		if !csrf.OriginAllowed(r, s.allow) {
			writeError(w, r, http.StatusForbidden, "CSRF_ORIGIN", "Invalid request origin")
			return
		}
		var sessionIDHash string
		if info := authFrom(r); info != nil {
			sessionIDHash = info.Session.IDHash
		} else if raw := s.sessionCookieValue(r); raw != "" {
			sessionIDHash = session.HashToken(raw)
		}
		headerToken := r.Header.Get("X-CSRF-Token")
		cookieToken := cookieValue(r, s.cfg.CSRFCookieName)
		if !csrf.Verify(cookieToken, headerToken, sessionIDHash, s.csrfStore) {
			writeError(w, r, http.StatusForbidden, "CSRF_REJECTED", "CSRF validation failed")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// captchaProtect enforces CAPTCHA on registration when configured.
func (s *Server) captchaProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.captcha.Enabled() {
			next.ServeHTTP(w, r)
			return
		}
		var body struct {
			CaptchaToken string `json:"captchaToken"`
		}
		if err := readJSON(r, &body); err != nil || body.CaptchaToken == "" {
			writeError(w, r, http.StatusBadRequest, "CAPTCHA_REQUIRED", "CAPTCHA verification required")
			return
		}
		if err := s.captcha.Verify(r.Context(), body.CaptchaToken, clientIPFrom(r)); err != nil {
			s.auditor.Record(s.auditEntry(r, "", "", audit.CaptchaFailed))
			writeError(w, r, http.StatusBadRequest, "CAPTCHA_FAILED", "CAPTCHA verification failed")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ─── IP helpers ─────────────────────────────────────────────────────────────

func parseCIDRs(list []string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(list))
	for _, c := range list {
		if !strings.Contains(c, "/") {
			if ip := net.ParseIP(c); ip != nil {
				bits := 32
				if ip.To4() == nil {
					bits = 128
				}
				c = c + "/" + strconv.Itoa(bits)
			}
		}
		if _, n, err := net.ParseCIDR(c); err == nil {
			out = append(out, n)
		}
	}
	return out
}

func remoteAddrIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return net.ParseIP(r.RemoteAddr)
	}
	return net.ParseIP(host)
}
