package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/email"
	"github.com/meshwork-studio/auth/internal/password"
	"github.com/meshwork-studio/auth/internal/store"
)

const (
	resetTokenTTL  = 30 * time.Minute
	verifyTokenTTL = 24 * time.Hour
)

func newOneTimeToken() (raw string, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, password.KeyedHash("one-time-token", raw), nil
}

// ─── Forgot password ────────────────────────────────────────────────────────

type forgotBody struct {
	Email string `json:"email"`
}

func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body forgotBody
	if err := readJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "Email required")
		return
	}
	email := normalizeEmail(body.Email)
	user, lookupErr := s.db.FindUserByEmail(r.Context(), email)

	switch {
	case lookupErr == nil && user.PasswordHash != nil:
		raw, hash, terr := newOneTimeToken()
		if terr == nil {
			_ = s.db.InvalidateTokensForUser(r.Context(), user.ID, store.TokenPasswordReset)
			ipHash := s.ipHasher.Hash(clientIPFrom(r))
			if terr = s.db.CreateOneTimeToken(r.Context(), user.ID, store.TokenPasswordReset,
				hash, resetTokenTTL, ipHash); terr == nil {
				go s.sendEmail(EmailPasswordReset(user.Email,
					s.cfg.PublicURL+"/reset-password?token="+raw))
			}
		}
	default:
		// Account unknown or OAuth-only: burn equivalent work so the response
		// timing is indistinguishable, then answer generically.
		_ = password.VerifyDummyCtx(r.Context(), email)
	}

	// Always the same public answer — never reveal whether the account exists.
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "If an account with that email exists, a reset link has been sent.",
	})
}

// ─── Reset password ─────────────────────────────────────────────────────────

type resetBody struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var body resetBody
	if err := readJSON(r, &body); err != nil || len(body.Token) < 20 {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "A valid token and new password are required")
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

	userID, err := s.db.ConsumeOneTimeToken(r.Context(),
		password.KeyedHash("one-time-token", body.Token), store.TokenPasswordReset)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, r, http.StatusBadRequest, "TOKEN_INVALID", "Reset link is invalid or expired")
		return
	}
	if err != nil {
		s.writeInternal(w, r, err, "Reset failed")
		return
	}

	newHash, err := password.HashCtx(r.Context(), body.NewPassword)
	if hashBusy(w, r, err) {
		return
	}
	if err != nil {
		s.writeInternal(w, r, err, "Reset failed")
		return
	}
	if err := s.db.SetPasswordHash(r.Context(), userID, newHash, "argon2id"); err != nil {
		s.writeInternal(w, r, err, "Reset failed")
		return
	}
	// A reset is a credential compromise response: kill every session.
	if _, err := s.sessions.RevokeAllForUser(r.Context(), userID, ""); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Reset failed")
		return
	}

	user, _ := s.db.FindUserByID(r.Context(), userID)
	email := ""
	if user != nil {
		email = user.Email
	}
	s.auditor.Record(s.auditEntry(r, userID, email, audit.PasswordResetDone))
	go s.sendEmail(EmailPasswordChanged(email))

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "requiresLogin": true})
}

// ─── Email verification ─────────────────────────────────────────────────────

type verifyBody struct {
	Token string `json:"token"`
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var body verifyBody
	token := body.Token
	if err := readJSON(r, &body); err != nil || token == "" {
		token = r.URL.Query().Get("token")
		if token == "" {
			writeError(w, r, http.StatusBadRequest, "VALIDATION", "Verification token required")
			return
		}
	}
	userID, err := s.db.ConsumeOneTimeToken(r.Context(),
		password.KeyedHash("one-time-token", token), store.TokenEmailVerification)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, r, http.StatusBadRequest, "TOKEN_INVALID", "Verification link is invalid or expired")
		return
	}
	if err != nil {
		s.writeInternal(w, r, err, "Verification failed")
		return
	}
	if err := s.db.MarkEmailVerified(r.Context(), userID); err != nil {
		s.writeInternal(w, r, err, "Verification failed")
		return
	}
	s.auditor.Record(s.auditEntry(r, userID, "", audit.EmailVerified))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "verified": true})
}

func (s *Server) handleResendVerification(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	if info.User.EmailVerifiedAt != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "alreadyVerified": true})
		return
	}
	s.sendVerificationEmailAsync(info.User)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) sendVerificationEmailAsync(user *store.User) {
	if user == nil {
		return
	}
	go func() {
		raw, hash, err := newOneTimeToken()
		if err != nil {
			return
		}
		ctx, cancel := contextWithTimeout(10 * time.Second)
		defer cancel()
		if err := s.db.CreateOneTimeToken(ctx, user.ID, store.TokenEmailVerification,
			hash, verifyTokenTTL, ""); err != nil {
			return
		}
		if err := s.mailer.Send(EmailVerify(user.Email, s.cfg.PublicURL+"/verify-email?token="+raw)); err != nil {
			s.log.Error("verification email delivery failed", "err", err)
		}
	}()
}

func contextWithTimeout(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}

// sendEmail observes asynchronous delivery failures without leaking message bodies.
func (s *Server) sendEmail(message email.Message) {
	if err := s.mailer.Send(message); err != nil {
		s.log.Error("transactional email delivery failed", "err", err)
	}
}
