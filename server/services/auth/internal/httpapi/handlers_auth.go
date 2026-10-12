package httpapi

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/meshwork-studio/auth/internal/assertion"
	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/csrf"
	"github.com/meshwork-studio/auth/internal/password"
	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

// ─── Shared response shapes (contract-compatible with the legacy API) ───────

type authResponse struct {
	User               map[string]any `json:"user"`
	ExpiresAt          string         `json:"expiresAt"`
	AccessTokenExpires string         `json:"accessTokenExpiresAt"` // legacy name kept for client compatibility
}

func writeAuthSuccess(w http.ResponseWriter, u *store.User, expiresAt time.Time) {
	stamp := expiresAt.UTC().Format(time.RFC3339)
	writeJSON(w, http.StatusOK, authResponse{
		User:               u.Public(),
		ExpiresAt:          stamp,
		AccessTokenExpires: stamp,
	})
}

var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validateEmail(email string) bool {
	return len(email) <= 320 && emailPattern.MatchString(email)
}

// validatePassword enforces length bounds only. Composition rules are
// deliberately absent per NIST SP 800-63B; breached-password screening covers
// the dictionary problem.
func validatePassword(pw string) error {
	if len(pw) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	if len(pw) > 128 {
		return errors.New("password must not exceed 128 characters")
	}
	return nil
}

// sessionMeta extracts request metadata stored alongside sessions.
func (s *Server) sessionMeta(r *http.Request) (ua, ipHash *string) {
	if uaStr := r.UserAgent(); uaStr != "" {
		ua = &uaStr
	}
	if ip := clientIPFrom(r); ip != "" {
		h := s.ipHasher.Hash(ip)
		ipHash = &h
	}
	return ua, ipHash
}

// ─── CSRF token issuance ────────────────────────────────────────────────────

func (s *Server) handleIssueCSRF(w http.ResponseWriter, r *http.Request) {
	secret, err := csrf.NewSecret()
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Could not create token")
		return
	}
	var sessionIDHash string
	if raw := s.legacySessionRaw(r); raw != "" {
		sessionIDHash = session.HashToken(raw)
	}
	if err := csrf.Bind(s.csrfStore, sessionIDHash, secret, time.Hour); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Could not bind token")
		return
	}
	setCookie(w, s.cfg, s.cfg.CSRFCookieName, secret, time.Hour, false)
	writeJSON(w, http.StatusOK, map[string]any{"csrfToken": secret, "message": "CSRF token generated"})
}

// ─── Register ───────────────────────────────────────────────────────────────

type registerBody struct {
	Email        string  `json:"email"`
	Password     string  `json:"password"`
	FirstName    *string `json:"firstName"`
	LastName     *string `json:"lastName"`
	CaptchaToken string  `json:"captchaToken"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body registerBody
	if err := readJSON(r, &body); err != nil || !validateEmail(body.Email) {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "A valid email and password are required")
		return
	}
	if err := validatePassword(body.Password); err != nil {
		writeError(w, r, http.StatusBadRequest, "WEAK_PASSWORD", err.Error())
		return
	}
	if breached, err := password.Breached(body.Password); err == nil && breached {
		writeError(w, r, http.StatusBadRequest, "BREACHED_PASSWORD",
			"This password appears in public breach lists. Choose another.")
		return
	}

	email := normalizeEmail(body.Email)
	_, lookupErr := s.db.FindUserByEmail(r.Context(), email)
	hasExisting := lookupErr == nil
	if lookupErr != nil && !errors.Is(lookupErr, store.ErrNotFound) {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Registration unavailable")
		return
	}

	// Always pay full hash cost so success and conflict responses share one
	// latency profile (anti-enumeration).
	hash, herr := password.Hash(body.Password)
	if herr != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Registration unavailable")
		return
	}
	if hasExisting {
		password.VerifyDummy(body.Password)
		s.auditor.Record(s.auditEntry(r, "", email, audit.Register))
		writeError(w, r, http.StatusConflict, "REGISTRATION_UNAVAILABLE",
			"Registration could not be completed with the provided information.")
		return
	}

	user, err := s.db.CreateUser(r.Context(), store.CreateUserInput{
		Email:        body.Email,
		FirstName:    trimPtr(body.FirstName),
		LastName:     trimPtr(body.LastName),
		PasswordHash: strPtr(hash),
		AuthProvider: "email",
		PasswordAlgo: "argon2id",
	})
	if errors.Is(err, store.ErrDuplicateEmail) {
		// Lost a concurrent-registration race — identical public answer.
		s.auditor.Record(s.auditEntry(r, "", email, audit.Register))
		writeError(w, r, http.StatusConflict, "REGISTRATION_UNAVAILABLE",
			"Registration could not be completed with the provided information.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Registration unavailable")
		return
	}

	ua, ipHash := s.sessionMeta(r)
	rec, raw, err := s.sessions.Create(r.Context(), session.CreateInput{
		UserID: user.ID, UserAgent: ua, IPHash: ipHash,
	})
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Session creation failed")
		return
	}
	s.setSessionCookie(w, raw)
	s.issueAssertion(w, assertion.Identity{
		UserID:        user.ID,
		SessionIDHash: rec.IDHash,
		Email:         user.Email,
		Name:          displayName(user),
	})

	s.auditor.Record(s.auditEntry(r, user.ID, user.Email, audit.Register))
	s.sendVerificationEmailAsync(user)

	writeAuthSuccess(w, user, rec.ExpiresAt)
}

// ─── Login ──────────────────────────────────────────────────────────────────

type loginBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body loginBody
	if err := readJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "Email and password required")
		return
	}
	email := normalizeEmail(body.Email)

	locked, err := s.lockouts.Check(r.Context(), email)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Login unavailable")
		return
	}
	if locked {
		s.auditor.Record(s.auditEntry(r, "", email, audit.AccountLocked))
		writeError(w, r, http.StatusTooManyRequests, "ACCOUNT_LOCKED",
			"Too many failed attempts. Try again later.")
		return
	}

	user, lookupErr := s.db.FindUserByEmail(r.Context(), email)
	if lookupErr != nil && !errors.Is(lookupErr, store.ErrNotFound) {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Login unavailable")
		return
	}

	valid := false
	rehashToArgon2 := false
	switch {
	case user != nil && user.PasswordHash != nil:
		if v, verr := password.Verify(body.Password, *user.PasswordHash); verr == nil && v {
			valid = true
			rehashToArgon2 = password.NeedsRehash(*user.PasswordHash)
		}
	default:
		password.VerifyDummy(body.Password) // equalise miss-path timing
	}

	if !valid {
		res, rerr := s.lockouts.RecordFailure(r.Context(), email)
		s.auditor.Record(s.auditEntry(r, userIDOrEmpty(user), email, audit.LoginFailed))
		if rerr == nil && res.Locked {
			s.auditor.Record(s.auditEntry(r, userIDOrEmpty(user), email, audit.AccountLocked))
			writeError(w, r, http.StatusTooManyRequests, "ACCOUNT_LOCKED",
				"Too many failed attempts. Try again later.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid email or password")
		return
	}

	_ = s.lockouts.Reset(r.Context(), email)

	if rehashToArgon2 {
		if newHash, herr := password.Hash(body.Password); herr == nil {
			_ = s.db.SetPasswordHash(r.Context(), user.ID, newHash, "argon2id")
		}
	}

	if user.MFAEnabled {
		s.issueMFATicket(w, r, user)
		return
	}

	s.completeLogin(w, r, user)
}

func (s *Server) completeLogin(w http.ResponseWriter, r *http.Request, user *store.User) {
	oldRaw := s.legacySessionRaw(r)
	ua, ipHash := s.sessionMeta(r)
	rec, raw, err := s.sessions.Rotate(r.Context(), oldRaw, session.CreateInput{
		UserID: user.ID, UserAgent: ua, IPHash: ipHash,
	})
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Session creation failed")
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
	clearCookie(w, s.cfg.MFACookieName)

	s.auditor.Record(s.auditEntry(r, user.ID, user.Email, audit.LoginSuccess))
	s.notifyNewDeviceIfUnseen(r, user)
	writeAuthSuccess(w, user, rec.ExpiresAt)
}

// ─── Logout ─────────────────────────────────────────────────────────────────

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	raw := s.legacySessionRaw(r)
	userID := ""
	userEmail := ""
	if info := authFrom(r); info != nil {
		userID = info.User.ID
		userEmail = info.User.Email
	}
	if raw != "" {
		_ = s.sessions.Revoke(r.Context(), raw)
	}
	s.clearSessionCookies(w)
	s.auditor.Record(s.auditEntry(r, userID, userEmail, audit.Logout))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": "Logged out successfully"})
}

func (s *Server) handleLogoutAll(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	n, err := s.sessions.RevokeAllForUser(r.Context(), info.User.ID, "")
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Logout failed")
		return
	}
	s.clearSessionCookies(w)
	s.auditor.Record(s.auditEntry(r, info.User.ID, info.User.Email, audit.LogoutAll))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "revoked": n})
}

// ─── Session info ───────────────────────────────────────────────────────────

func (s *Server) handleSessionInfo(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	writeAuthSuccess(w, info.User, info.Session.ExpiresAt)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	body := info.User.Public()
	body["emailVerified"] = info.User.EmailVerifiedAt != nil
	body["mfaEnabled"] = info.User.MFAEnabled
	body["isAdmin"] = info.User.IsAdmin
	writeJSON(w, http.StatusOK, body)
}

// ─── Change password ────────────────────────────────────────────────────────

type changePasswordBody struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	var body changePasswordBody
	if err := readJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "Current and new passwords required")
		return
	}
	if err := validatePassword(body.NewPassword); err != nil {
		writeError(w, r, http.StatusBadRequest, "WEAK_PASSWORD", err.Error())
		return
	}
	if breached, err := password.Breached(body.NewPassword); err == nil && breached {
		writeError(w, r, http.StatusBadRequest, "BREACHED_PASSWORD",
			"This password appears in public breach lists. Choose another.")
		return
	}

	ok := false
	if info.User.PasswordHash != nil {
		ok, _ = password.Verify(body.CurrentPassword, *info.User.PasswordHash)
	} else {
		password.VerifyDummy(body.CurrentPassword)
	}
	if !ok {
		s.auditor.Record(s.auditEntry(r, info.User.ID, info.User.Email, audit.LoginFailed))
		writeError(w, r, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Current password is incorrect")
		return
	}

	newHash, err := password.Hash(body.NewPassword)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Change failed")
		return
	}
	if err := s.db.SetPasswordHash(r.Context(), info.User.ID, newHash, "argon2id"); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Change failed")
		return
	}
	// Revoke EVERYTHING including the current session — full re-login everywhere.
	if _, err := s.sessions.RevokeAllForUser(r.Context(), info.User.ID, ""); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Change failed")
		return
	}
	_ = s.db.InvalidateTokensForUser(r.Context(), info.User.ID, store.TokenPasswordReset)
	s.clearSessionCookies(w)

	s.auditor.Record(s.auditEntry(r, info.User.ID, info.User.Email, audit.PasswordChange))
	go s.sendEmail(EmailPasswordChanged(info.User.Email))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "requiresLogin": true})
}

// ─── Preferences ────────────────────────────────────────────────────────────

type prefsBody struct {
	HasNotifiedTeam     *bool  `json:"hasNotifiedTeam"`
	ReadNotificationIDs *[]int `json:"readNotificationIds"`
}

func (s *Server) handleUpdatePreferences(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	var body prefsBody
	if err := readJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "Invalid preference payload")
		return
	}
	user, err := s.db.UpdatePreferences(r.Context(), info.User.ID, body.HasNotifiedTeam, body.ReadNotificationIDs)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Update failed")
		return
	}
	writeJSON(w, http.StatusOK, user.Public())
}

// ─── Small helpers ──────────────────────────────────────────────────────────

func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

func strPtr(s string) *string { return &s }

func userIDOrEmpty(u *store.User) string {
	if u == nil {
		return ""
	}
	return u.ID
}

// displayName picks the friendliest label available for assertions.
func displayName(u *store.User) string {
	if u.FirstName != nil && *u.FirstName != "" {
		return *u.FirstName
	}
	if i := strings.IndexByte(u.Email, '@'); i > 0 {
		return u.Email[:i]
	}
	return u.Email
}

// assertionIdentity packs a user + session into assertion claims.
func assertionIdentity(u *store.User, sessionIDHash string) assertion.Identity {
	return assertion.Identity{
		UserID:        u.ID,
		SessionIDHash: sessionIDHash,
		Admin:         u.IsAdmin,
		Email:         u.Email,
		Name:          displayName(u),
	}
}
