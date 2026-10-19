package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/meshwork-studio/auth/internal/assertion"
	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/csrf"
	"github.com/meshwork-studio/auth/internal/mfa"
	"github.com/meshwork-studio/auth/internal/password"
	"github.com/meshwork-studio/auth/internal/session"
	"github.com/meshwork-studio/auth/internal/store"
)

const (
	mfaTicketTTL       = 5 * time.Minute
	mfaTicketCookieTTL = 5 * time.Minute
)

func cryptoRandRead(b []byte) (int, error) { return rand.Read(b) }

func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func normalizeBackupCode(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func verifyPasswordHash(ctx context.Context, plain, hash string) (bool, error) {
	return password.VerifyCtx(ctx, plain, hash)
}

// issueMFATicket hands out a single-use, short-lived cookie after a correct
// password so the TOTP step can complete without creating a session.
func (s *Server) issueMFATicket(w http.ResponseWriter, r *http.Request, user *store.User) {
	b := make([]byte, 32)
	if _, err := cryptoRandRead(b); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Login failed")
		return
	}
	raw := base64.RawURLEncoding.EncodeToString(b)
	key := mfaTicketPrefix + csrf.HashForLookup(raw)
	if s.rdb == nil {
		writeError(w, r, http.StatusServiceUnavailable, "MFA_UNAVAILABLE", "MFA temporarily unavailable")
		return
	}
	if err := s.rdb.Set(r.Context(), key, user.ID, mfaTicketTTL).Err(); err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "MFA_UNAVAILABLE", "MFA temporarily unavailable")
		return
	}
	// Attempt counter for the challenge step.
	s.rdb.Set(r.Context(), key+":tries", "0", mfaTicketTTL)

	setCookie(w, s.cfg, s.cfg.MFACookieName, raw, mfaTicketCookieTTL, true)
	writeJSON(w, http.StatusOK, map[string]any{
		"mfaRequired": true,
		"message":     "Enter your authenticator code to continue",
	})
}

type mfaChallengeBody struct {
	Code       string `json:"code"`
	BackupCode string `json:"backupCode"`
}

func (s *Server) handleMFAChallenge(w http.ResponseWriter, r *http.Request) {
	ticketUserID, _ := r.Context().Value(mfaTicketUserKey{}).(string)
	if ticketUserID == "" || s.rdb == nil {
		writeError(w, r, http.StatusUnauthorized, "MFA_TICKET_INVALID", "Verification window expired")
		return
	}

	user, err := s.db.FindUserByID(r.Context(), ticketUserID)
	if err != nil || !user.MFAEnabled {
		writeError(w, r, http.StatusUnauthorized, "MFA_TICKET_INVALID", "Verification window expired")
		return
	}

	var body mfaChallengeBody
	if err := readJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "A verification code is required")
		return
	}

	// Bounded brute-force: the ticket is single-use (GetDel at middleware),
	// so each attempt requires a fresh password step. Codes are additionally
	// validated with strict length/format checks.
	ok := false
	switch {
	case body.Code != "":
		if len(body.Code) >= 6 && len(body.Code) <= 8 && isNumeric(body.Code) {
			ok = s.mfa.Verify(user.MFASecretOrEmpty(), body.Code)
		}
	case body.BackupCode != "":
		hash := mfa.HashBackupCode(normalizeBackupCode(body.BackupCode))
		n, cerr := s.consumeBackupCode(r.Context(), user.ID, hash)
		if cerr == nil && n > 0 {
			ok = true
		}
	}

	if !ok {
		s.auditor.Record(s.auditEntry(r, user.ID, user.Email, audit.MFAChallengeFailed))
		writeError(w, r, http.StatusUnauthorized, "MFA_INVALID", "Invalid verification code")
		return
	}

	// Password + second factor proven: full session.
	oldRaw := "" // no session exists yet during MFA flow
	ua, ipHash := s.sessionMeta(r)
	rec, raw, err := s.sessions.Rotate(r.Context(), oldRaw, session.CreateInput{
		UserID: user.ID, UserAgent: ua, IPHash: ipHash,
	})
	if err != nil {
		s.writeInternal(w, r, err, "Login failed")
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

// ─── Enrollment / management ────────────────────────────────────────────────

type enrollResponse struct {
	Secret     string `json:"secret"`
	OtpauthURI string `json:"otpauthUri"`
	Message    string `json:"message"`
}

func (s *Server) handleMFAEnroll(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	if info.User.MFAEnabled {
		writeError(w, r, http.StatusConflict, "MFA_ENABLED", "MFA is already active; disable it first")
		return
	}
	secret, uri, sealed, err := s.mfa.Enroll(info.User.Email)
	if err != nil {
		s.writeInternal(w, r, err, "Enrollment failed")
		return
	}
	if err := s.db.SetMFASecret(r.Context(), info.User.ID, strPtr(sealed)); err != nil {
		s.writeInternal(w, r, err, "Enrollment failed")
		return
	}
	s.auditor.Record(s.auditEntry(r, info.User.ID, info.User.Email, audit.MFAEnrollStart))
	writeJSON(w, http.StatusOK, enrollResponse{
		Secret: secret, OtpauthURI: uri,
		Message: "Scan with your authenticator app, then confirm with a code",
	})
}

type mfaActivateBody struct {
	Code string `json:"code"`
}

func (s *Server) handleMFAActivate(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	var body mfaActivateBody
	if err := readJSON(r, &body); err != nil || !isNumeric(body.Code) {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "A numeric code is required")
		return
	}
	if info.User.MFAEnabled {
		writeError(w, r, http.StatusConflict, "MFA_ENABLED", "MFA is already active")
		return
	}
	if !s.mfa.Verify(info.User.MFASecretOrEmpty(), body.Code) {
		writeError(w, r, http.StatusBadRequest, "MFA_INVALID", "Code did not match; try the next one")
		return
	}
	if err := s.db.ActivateMFA(r.Context(), info.User.ID); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Activation failed")
		return
	}
	codes, hashes, err := mfa.GenerateBackupCodes()
	if err == nil {
		_ = s.db.ReplaceBackupCodes(r.Context(), info.User.ID, hashes)
	} else {
		codes = nil
	}
	s.auditor.Record(s.auditEntry(r, info.User.ID, info.User.Email, audit.MFAActivated))
	go s.sendEmail(EmailMFAEnabled(info.User.Email))
	resp := map[string]any{"ok": true}
	if codes != nil {
		resp["backupCodes"] = codes
		resp["warning"] = "Store these backup codes now — they are shown only once"
	}
	writeJSON(w, http.StatusOK, resp)
}

type mfaDisableBody struct {
	Password   string `json:"password"`
	Code       string `json:"code"`
	BackupCode string `json:"backupCode"`
}

func (s *Server) handleMFADisable(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	var body mfaDisableBody
	if err := readJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "Password confirmation required")
		return
	}
	ok := false
	if info.User.PasswordHash != nil {
		v, verr := verifyPasswordHash(r.Context(), body.Password, *info.User.PasswordHash)
		if hashBusy(w, r, verr) {
			return
		}
		ok = verr == nil && v
	}
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Password incorrect")
		return
	}
	// Require a current factor so a stolen password alone cannot strip MFA.
	factorOK := false
	switch {
	case body.Code != "":
		factorOK = s.mfa.Verify(info.User.MFASecretOrEmpty(), body.Code)
	case body.BackupCode != "":
		n, _ := s.consumeBackupCode(r.Context(), info.User.ID, mfa.HashBackupCode(normalizeBackupCode(body.BackupCode)))
		factorOK = n > 0
	}
	if !factorOK {
		writeError(w, r, http.StatusUnauthorized, "MFA_INVALID", "A valid code is required to disable MFA")
		return
	}
	if err := s.db.DisableMFA(r.Context(), info.User.ID); err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL", "Disable failed")
		return
	}
	s.auditor.Record(s.auditEntry(r, info.User.ID, info.User.Email, audit.MFADisabled))
	go s.sendEmail(EmailMFADisabled(info.User.Email))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── Device / session management ────────────────────────────────────────────

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	recs, err := s.sessions.ListActiveForUser(r.Context(), info.User.ID)
	if err != nil {
		s.writeInternal(w, r, err, "Could not list sessions")
		return
	}
	out := make([]map[string]any, 0, len(recs))
	for _, rec := range recs {
		out = append(out, map[string]any{
			"id":         rec.IDHash[:12],
			"fullHash":   rec.IDHash,
			"current":    rec.IDHash == info.Session.IDHash,
			"createdAt":  rec.CreatedAt.UTC(),
			"lastSeenAt": rec.LastSeenAt.UTC(),
			"expiresAt":  rec.AbsoluteExpiresAt.UTC(),
			"userAgent":  rec.UserAgent,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

func (s *Server) handleRevokeSession(w http.ResponseWriter, r *http.Request) {
	info := authFrom(r)
	idHash := chi.URLParam(r, "idHash")
	if len(idHash) < 16 {
		writeError(w, r, http.StatusBadRequest, "VALIDATION", "Session id required")
		return
	}
	err := s.sessions.RevokeByID(r.Context(), info.User.ID, idHash)
	if errors.Is(err, session.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	if err != nil {
		s.writeInternal(w, r, err, "Revoke failed")
		return
	}
	s.auditor.Record(s.auditEntry(r, info.User.ID, info.User.Email, audit.SessionRevoked))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
