package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"

	"github.com/meshwork-studio/auth/internal/assertion"
	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/captcha"
	"github.com/meshwork-studio/auth/internal/config"
	"github.com/meshwork-studio/auth/internal/csrf"
	"github.com/meshwork-studio/auth/internal/email"
	"github.com/meshwork-studio/auth/internal/iphash"
	"github.com/meshwork-studio/auth/internal/lockout"
	"github.com/meshwork-studio/auth/internal/mfa"
	"github.com/meshwork-studio/auth/internal/ratelimit"
	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

type Server struct {
	cfg         *config.Config
	db          *store.DB
	sessions    *session.Store
	lockouts    *lockout.Store
	rdb         redis.UniversalClient
	limiter     *ratelimit.Limiter
	csrfStore   csrf.SecretStore
	mailer      *email.Mailer
	mfa         *mfa.Manager
	captcha     *captcha.Verifier
	auditor     *audit.Writer
	ipHasher    *iphash.Hasher
	oauthCfg    *oauth2.Config
	assert      *assertion.Signer
	internalKey string
	allow       *csrf.Allowlist
	log         *slog.Logger
	http        *http.Server
}

func NewServer(cfg *config.Config, pool *pgxpool.Pool, rdb redis.UniversalClient, log *slog.Logger) (*Server, error) {
	db := &store.DB{Pool: pool}

	var mfaMgr *mfa.Manager
	if crypto, err := mfa.NewCrypto(cfg.EncryptionKey); err == nil {
		mfaMgr = mfa.NewManager(crypto)
	} else {
		return nil, err
	}

	sessions := session.NewStore(pool, rdb, cfg.IdleTTL, cfg.AbsoluteTTL, cfg.TouchEvery)

	var oauth *oauth2.Config
	if cfg.GoogleClientID != "" {
		oauth = &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  strings.TrimSuffix(cfg.PublicURL, "/") + "/api/v1/auth/google/callback",
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     oauth2.Endpoint{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token"}, // #nosec G101 -- Public OAuth endpoint URLs, not credentials.
		}
	}

	var (
		signer *assertion.Signer
		err    error
	)
	if cfg.AssertionPrivateKey != "" {
		signer, _, err = assertion.NewSigner(cfg.AssertionPrivateKey, cfg.AssertionTTL, cfg.AssertionPrevKeys)
		if err != nil {
			return nil, fmt.Errorf("assertion keys: %w", err)
		}
	} else if cfg.IsProduction() {
		return nil, errors.New("AUTH_ASSERTION_PRIVATE_KEY is required in production")
	} else {
		signer, _, err = assertion.NewEphemeralSigner(cfg.AssertionTTL)
		if err != nil {
			return nil, err
		}
		log.Warn("using EPHEMERAL assertion key — monolith cannot verify across restarts (development only)")
	}

	s := &Server{
		cfg:         cfg,
		db:          db,
		sessions:    sessions,
		lockouts:    lockout.New(pool),
		rdb:         rdb,
		limiter:     ratelimit.New(rdb),
		csrfStore:   db,
		mailer:      email.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.EmailFrom, log),
		mfa:         mfaMgr,
		captcha:     captcha.New(cfg.CaptchaSecret, captcha.Provider(cfg.CaptchaProvider), cfg.CaptchaMinScore, rdb),
		ipHasher:    iphash.New(cfg.IPHashKey),
		oauthCfg:    oauth,
		assert:      signer,
		internalKey: cfg.InternalKey,
		log:         log,
	}
	s.auditor = audit.New(db, log)
	internalKeyValue = cfg.InternalKey
	return s, nil
}

// Router builds the full HTTP surface.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(requestIDMiddleware)
	r.Use(realIPMiddleware(s.cfg.TrustedProxies))
	r.Use(recoverMiddleware(s.log))
	r.Use(s.metricsMiddleware)

	allow := csrf.NewAllowlist(s.cfg.PublicURL, s.cfg.ExtraAllowedOrigins)
	s.allow = allow

	// Liveness/readiness (container healthchecks hit these directly).
	r.Get("/healthz", s.handleHealth)
	r.Get("/readyz", s.handleReady)

	// Prometheus metrics are served ONLY on the loopback interface via
	// MetricsHandler() — never through the public ingress.

	api := chi.NewRouter()

	// Public, unauthenticated endpoints.
	api.Get("/auth/csrf-token", s.handleIssueCSRF)
	api.With(s.limiter.Middleware(ipKey("register"), s.cfg.LoginWindowPerIP, 15*time.Minute), s.csrfProtect, s.captchaProtect).
		Post("/auth/register", s.handleRegister)
	api.With(s.limiter.Middleware(ipKey("login"), s.cfg.LoginWindowPerIP, 15*time.Minute), s.csrfProtect).
		Post("/auth/login", s.handleLogin)
	api.With(s.limiter.Middleware(ipKey("mfa"), 10, 15*time.Minute), s.csrfProtect, s.requireMFATicket).
		Post("/auth/mfa/challenge", s.handleMFAChallenge)
	api.With(s.limiter.Middleware(ipKey("forgot"), 5, 15*time.Minute), s.csrfProtect).
		Post("/auth/forgot-password", s.handleForgotPassword)
	api.With(s.limiter.Middleware(ipKey("reset"), 10, 15*time.Minute), s.csrfProtect).
		Post("/auth/reset-password", s.handleResetPassword)
	api.With(s.limiter.Middleware(ipKey("verify"), 10, 15*time.Minute), s.csrfProtect).
		Post("/auth/verify-email", s.handleVerifyEmail)

	// OAuth.
	if s.oauthCfg != nil {
		api.Get("/auth/google", s.handleGoogleStart)
		api.Get("/auth/google/callback", s.handleGoogleCallback)
		api.With(s.limiter.Middleware(ipKey("link"), 10, 15*time.Minute), s.csrfProtect).
			Post("/auth/google/link", s.handleGoogleLinkConfirm)
	}

	// Session-authenticated endpoints.
	api.Group(func(a chi.Router) {
		a.Use(s.requireAuth)
		a.With(s.csrfProtect).Post("/auth/logout", s.handleLogout)
		a.With(s.csrfProtect).Post("/auth/logout-all", s.handleLogoutAll)
		a.Get("/auth/session", s.handleSessionInfo)
		a.Get("/auth/me", s.handleMe)
		a.With(s.csrfProtect).Post("/auth/change-password", s.handleChangePassword)
		a.With(s.csrfProtect).Patch("/user/preferences", s.handleUpdatePreferences)

		a.Get("/auth/sessions", s.handleListSessions)
		a.With(s.csrfProtect).Delete("/auth/sessions/{idHash}", s.handleRevokeSession)

		a.With(s.limiter.Middleware(userKey("resend"), 3, 15*time.Minute), s.csrfProtect).
			Post("/auth/resend-verification", s.handleResendVerification)

		// MFA management.
		a.With(s.csrfProtect).Post("/auth/mfa/enroll", s.handleMFAEnroll)
		a.With(s.csrfProtect).Post("/auth/mfa/activate", s.handleMFAActivate)
		a.With(s.csrfProtect).Post("/auth/mfa/disable", s.handleMFADisable)
	})
	api.NotFound(func(w http.ResponseWriter, req *http.Request) {
		writeError(w, req, http.StatusNotFound, "NOT_FOUND", "Unknown endpoint")
	})
	api.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		writeError(w, req, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed")
	})

	// Server-to-server surface. Never routed through NGINX; guarded by the
	// shared internal key inside the handler itself.
	r.Post("/internal/introspect", s.handleIntrospect)
	r.Get("/internal/stats/users", s.handleUserStats)
	r.Get("/internal/audit-search", s.handleAuditSearch)

	r.Route("/api/v1", func(v1 chi.Router) { v1.Mount("/", api) })
	r.Mount("/debug/pprof", pprofDisabled())
	return r
}

// HTTPServer finalises the underlying http.Server for a given address.
func (s *Server) HTTPServer(addr string) *http.Server {
	s.http = &http.Server{
		Addr:              addr,
		Handler:           s.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	return s.http
}

// MetricsHandler exposes Prometheus output; main binds it to loopback only.
func MetricsHandler() http.Handler {
	return promhttp.Handler()
}

func pprofDisabled() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "pprof disabled", http.StatusForbidden)
	}
}

// handleHealth reports DB connectivity.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	status := http.StatusOK
	checks := map[string]bool{"postgres": false}
	if err := s.db.Ping(ctx); err == nil {
		checks["postgres"] = true
	} else {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, map[string]any{
		"status": map[bool]string{true: "healthy", false: "degraded"}[status == http.StatusOK],
		"checks": checks,
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "not_ready"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready"})
}

func trustedProxyAllowed(ip net.IP, cidrs []*net.IPNet) bool {
	for _, c := range cidrs {
		if c.Contains(ip) {
			return true
		}
	}
	return false
}
