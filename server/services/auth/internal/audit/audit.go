// Package audit writes an append-only security trail. Writes are
// asynchronous through a bounded queue: auth latency never waits on the
// audit insert, and a slow DB cannot stall logins. Events are mirrored to
// structured logs so they survive even if the queue overflows.
package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"
)

type Event string

const (
	Register           Event = "register"
	LoginSuccess       Event = "login_success"
	LoginFailed        Event = "login_failed"
	AccountLocked      Event = "account_locked"
	Logout             Event = "logout"
	LogoutAll          Event = "logout_all"
	PasswordChange     Event = "password_change"
	PasswordResetReq   Event = "password_reset_request"
	PasswordResetDone  Event = "password_reset"
	EmailVerifyReq     Event = "email_verify_request"
	EmailVerified      Event = "email_verified"
	MFAEnrollStart     Event = "mfa_enroll_start"
	MFAActivated       Event = "mfa_activated"
	MFADisabled        Event = "mfa_disabled"
	MFAChallengeFailed Event = "mfa_challenge_failed"
	SessionRevoked     Event = "session_revoked"
	OAuthLink          Event = "oauth_link"
	OAuthLogin         Event = "oauth_login"
	OAuthStateRejected Event = "oauth_state_rejected"
	CaptchaFailed      Event = "captcha_failed"
	RateLimited        Event = "rate_limited"
	NewDeviceLogin     Event = "new_device_login"
	PrefsUpdated       Event = "prefs_updated"
)

type Writer struct {
	queue chan entry
	store Store
	log   *slog.Logger
}

type Store interface {
	Insert(ctx context.Context, e Entry) error
}

type Entry struct {
	UserID    string
	Email     string
	Event     Event
	IPHash    string
	UserAgent string
	Metadata  map[string]any
	// RequestID joins this row to request logs (Node + Go) and error
	// bodies. Empty for background jobs with no inbound request.
	RequestID string
}

type entry struct {
	e Entry
}

func New(store Store, logger *slog.Logger) *Writer {
	w := &Writer{
		queue: make(chan entry, 1024),
		store: store,
		log:   logger,
	}
	go w.worker()
	return w
}

// Record enqueues an event; never blocks the caller.
func (w *Writer) Record(e Entry) {
	select {
	case w.queue <- entry{e: e}:
	default:
		w.log.Warn("audit queue full, event logged only", "event", string(e.Event), "user_id", e.UserID)
	}
}

func (w *Writer) worker() {
	for item := range w.queue {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := w.store.Insert(ctx, item.e); err != nil {
			w.log.Error("audit insert failed",
				"err", err, "event", string(item.e.Event), "user_id", item.e.UserID)
		}
		cancel()
	}
}

func (w *Writer) LogOnly(e Entry) {
	meta, _ := json.Marshal(e.Metadata)
	w.log.Info("audit",
		"event", string(e.Event),
		"user_id", e.UserID,
		"ip_hash", e.IPHash,
		"request_id", e.RequestID,
		"meta", string(meta))
}
