package config

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the complete, validated runtime configuration of the identity
// service. Every variable it needs lives in its own AUTH_* namespace so
// the service can be deployed with strict per-service environment isolation.
type Config struct {
	Port      string
	AppEnv    string // "production" | "development" | "test"
	PublicURL string // canonical public origin, e.g. https://app.example.com

	ExtraAllowedOrigins []string

	DatabaseURL string
	RedisURL    string

	SessionCookieName string
	CSRFCookieName    string
	MFACookieName     string
	PKCECookieName    string
	CookieSecure      bool

	AbsoluteTTL time.Duration // hard ceiling for a session lifetime
	IdleTTL     time.Duration // re-create session after this much inactivity
	TouchEvery  time.Duration // throttle last_seen writes

	IPHashKey     []byte // HMAC-SHA256 key for IP pseudonymisation
	EncryptionKey []byte // AES-256-GCM key for MFA secrets at rest

	InternalKey string // shared secret for server-to-server introspection

	AssertionPrivateKey string   // ed25519 seed (b64) signing session assertions
	AssertionPrevKeys   []string // previous public seeds accepted during rotation
	AssertionTTL        time.Duration
	TrustedProxies      []string

	SMTPHost  string
	SMTPPort  int
	SMTPUser  string
	SMTPPass  string
	EmailFrom string

	GoogleClientID     string
	GoogleClientSecret string

	CaptchaSecret   string
	CaptchaProvider string // "hcaptcha" | "recaptcha" | ""
	CaptchaMinScore float64

	BootstrapAdminEmails []string

	LoginWindowPerIP int // requests per 15 min per IP for login/register/forgot
}

var collectedErrors []string

func fail(cond bool, format string, args ...any) {
	if cond {
		collectedErrors = append(collectedErrors, fmt.Sprintf(format, args...))
	}
}

func str(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}

func required(key string) string {
	v := str(key)
	if v == "" {
		collectedErrors = append(collectedErrors, fmt.Sprintf("AUTH config: %s is required", key))
	}
	return v
}

func duration(key string, def time.Duration) time.Duration {
	v := str(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		collectedErrors = append(collectedErrors, fmt.Sprintf("AUTH config: %s must be a positive duration (e.g. 30m), got %q", key, v))
		return def
	}
	return d
}

func decodeKey(key string, size int) []byte {
	v := required(key)
	if v == "" {
		return nil
	}
	b, err := base64.StdEncoding.DecodeString(v)
	if err != nil || len(b) != size {
		collectedErrors = append(collectedErrors, fmt.Sprintf("AUTH config: %s must be base64 of exactly %d bytes (openssl rand -base64 %d)", key, size, size))
		return nil
	}
	return b
}

// randomKey generates an ephemeral key for non-production environments where
// no explicit key is configured. Production always requires explicit keys.
func randomKey(size int) []byte {
	b := make([]byte, size)
	_, _ = rand.Read(b)
	return b
}

// Load reads the environment and returns a fully validated Config. All
// validation problems are aggregated and reported at once — the service
// refuses to start on any error. There are no insecure defaults: production
// boot without real keys is impossible.
func Load() (*Config, error) {
	collectedErrors = nil

	cfg := &Config{
		Port:            str("AUTH_PORT"),
		AppEnv:          str("NODE_ENV"),
		PublicURL:       strings.TrimSuffix(str("APP_PUBLIC_URL"), "/"),
		DatabaseURL:     os.Getenv("AUTH_DATABASE_URL"),
		RedisURL:        str("AUTH_REDIS_URL"),
		SMTPHost:        str("SMTP_HOST"),
		SMTPPort:        587,
		SMTPUser:        str("SMTP_USER"),
		SMTPPass:        os.Getenv("SMTP_PASS"),
		EmailFrom:          str("EMAIL_FROM"),
		GoogleClientID:     str("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		CaptchaSecret:      os.Getenv("CAPTCHA_SECRET"),
		CaptchaMinScore: 0.5,
	}

	if cfg.Port == "" {
		cfg.Port = "8081"
	}
	if cfg.AppEnv == "" {
		cfg.AppEnv = "development"
	}
	fail(cfg.AppEnv != "production" && cfg.AppEnv != "development" && cfg.AppEnv != "test",
		"NODE_ENV must be production|development|test, got %q", cfg.AppEnv)

	cfg.CookieSecure = cfg.AppEnv == "production"
	if cfg.CookieSecure {
		cfg.SessionCookieName = "__Host-meshwork_session"
		cfg.CSRFCookieName = "__Host-meshwork_csrf"
	} else {
		cfg.SessionCookieName = "meshwork_session"
		cfg.CSRFCookieName = "meshwork_csrf"
	}
	cfg.MFACookieName = "meshwork_mfa_ticket"
	cfg.PKCECookieName = "meshwork_pkce"

	cfg.AbsoluteTTL = duration("SESSION_ABSOLUTE_TTL", 14*24*time.Hour)
	cfg.IdleTTL = duration("SESSION_IDLE_TTL", 7*24*time.Hour)
	cfg.TouchEvery = duration("SESSION_TOUCH_EVERY", time.Minute)

	fail(cfg.AbsoluteTTL < cfg.IdleTTL,
		"SESSION_ABSOLUTE_TTL (%s) must be >= SESSION_IDLE_TTL (%s)", cfg.AbsoluteTTL, cfg.IdleTTL)

	isProd := cfg.AppEnv == "production"

	fail(isProd && cfg.PublicURL == "", "APP_PUBLIC_URL is required in production")
	fail(cfg.DatabaseURL == "", "AUTH_DATABASE_URL is required")

	for _, o := range strings.Split(str("EXTRA_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.ExtraAllowedOrigins = append(cfg.ExtraAllowedOrigins, o)
		}
	}

	// Keys: explicit in production, ephemeral-but-loud in development.
	ipRaw := str("AUTH_IP_HASH_KEY")
	encRaw := str("AUTH_ENCRYPTION_KEY")
	switch {
	case ipRaw != "":
		cfg.IPHashKey = decodeKey("AUTH_IP_HASH_KEY", 32)
	case isProd:
		collectedErrors = append(collectedErrors, "AUTH config: AUTH_IP_HASH_KEY is required in production")
	default:
		cfg.IPHashKey = randomKey(32)
	}
	switch {
	case encRaw != "":
		cfg.EncryptionKey = decodeKey("AUTH_ENCRYPTION_KEY", 32)
	case isProd:
		collectedErrors = append(collectedErrors, "AUTH config: AUTH_ENCRYPTION_KEY is required in production")
	default:
		cfg.EncryptionKey = randomKey(32)
	}

	cfg.InternalKey = str("AUTH_INTERNAL_KEY")
	fail(isProd && cfg.InternalKey == "",
		"AUTH_INTERNAL_KEY is required in production (monolith → auth introspection)")

	cfg.AssertionPrivateKey = str("AUTH_ASSERTION_PRIVATE_KEY")
	fail(isProd && cfg.AssertionPrivateKey == "",
		"AUTH_ASSERTION_PRIVATE_KEY is required in production (the monolith verifies these locally)")
	for _, k := range strings.Split(str("AUTH_ASSERTION_PREVIOUS_KEYS"), ",") {
		if k = strings.TrimSpace(k); k != "" {
			cfg.AssertionPrevKeys = append(cfg.AssertionPrevKeys, k)
		}
	}
	cfg.AssertionTTL = duration("AUTH_ASSERTION_TTL", 5*time.Minute)

	tp := str("TRUSTED_PROXIES")
	if tp == "" {
		cfg.TrustedProxies = []string{"127.0.0.1", "::1"}
	} else {
		for _, p := range strings.Split(tp, ",") {
			if p = strings.TrimSpace(p); p != "" {
				cfg.TrustedProxies = append(cfg.TrustedProxies, p)
			}
		}
	}

	if p := str("SMTP_PORT"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n <= 0 || n > 65535 {
			collectedErrors = append(collectedErrors, fmt.Sprintf("AUTH config: SMTP_PORT invalid: %q", p))
		} else {
			cfg.SMTPPort = n
		}
	}
	fail(isProd && (cfg.SMTPHost == "" || cfg.EmailFrom == ""),
		"SMTP_HOST and EMAIL_FROM are required in production (email verification and password reset depend on them)")

	if s := str("CAPTCHA_PROVIDER"); s != "" {
		fail(s != "hcaptcha" && s != "recaptcha", "CAPTCHA_PROVIDER must be hcaptcha or recaptcha, got %q", s)
		cfg.CaptchaProvider = s
	} else if cfg.CaptchaSecret != "" {
		cfg.CaptchaProvider = "recaptcha"
	}
	if s := str("CAPTCHA_MIN_SCORE"); s != "" {
		f, err := strconv.ParseFloat(s, 64)
		if err != nil || f < 0 || f > 1 {
			collectedErrors = append(collectedErrors, fmt.Sprintf("AUTH config: CAPTCHA_MIN_SCORE must be within [0,1], got %q", s))
		} else {
			cfg.CaptchaMinScore = f
		}
	}
	fail(cfg.CaptchaSecret != "" && cfg.CaptchaProvider == "", "CAPTCHA_SECRET set but CAPTCHA_PROVIDER missing")

	for _, e := range strings.Split(str("BOOTSTRAP_ADMIN_EMAILS"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			cfg.BootstrapAdminEmails = append(cfg.BootstrapAdminEmails, e)
		}
	}

	if v := str("LOGIN_RATE_LIMIT_PER_IP"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			collectedErrors = append(collectedErrors, fmt.Sprintf("AUTH config: LOGIN_RATE_LIMIT_PER_IP must be a positive integer, got %q", v))
		} else {
			cfg.LoginWindowPerIP = n
		}
	} else {
		cfg.LoginWindowPerIP = 20
	}

	if len(collectedErrors) > 0 {
		return nil, errors.New("identity service configuration invalid:\n  - " + strings.Join(collectedErrors, "\n  - "))
	}
	return cfg, nil
}

// IsProduction reports whether the service runs with production guarantees.
func (c *Config) IsProduction() bool { return c.AppEnv == "production" }
