package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/meshwork-studio/auth/internal/audit"
)

// InsertAudit satisfies audit.Store.
func (d *DB) InsertAudit(ctx context.Context, e audit.Entry) error {
	var meta []byte
	if e.Metadata != nil {
		meta, _ = json.Marshal(e.Metadata)
	}
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO audit_events (user_id, email, event, ip_hash, user_agent, metadata, request_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		nilIfEmpty(e.UserID), nilIfEmpty(e.Email), string(e.Event),
		nilIfEmpty(e.IPHash), nilIfEmpty(e.UserAgent), meta,
		nilIfEmpty(e.RequestID))
	return fmt.Errorf("insertAudit: %w", err)
}

// One-time tokens -----------------------------------------------------------

type TokenPurpose string

const (
	TokenPasswordReset     TokenPurpose = "password_reset"
	TokenEmailVerification TokenPurpose = "email_verification" // #nosec G101 -- Purpose label, not a credential.
)

// CreateOneTimeToken stores the hash of a fresh token for purpose.
func (d *DB) CreateOneTimeToken(ctx context.Context, userID string, purpose TokenPurpose, tokenHash string, ttl time.Duration, ipHash string) error {
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO one_time_tokens (token_hash, user_id, purpose, expires_at, created_ip_hash)
		VALUES ($1,$2,$3,$4,$5)`,
		tokenHash, userID, string(purpose), time.Now().Add(ttl), nilIfEmpty(ipHash))
	return fmt.Errorf("createOneTimeToken: %w", err)
}

// ConsumeOneTimeToken atomically marks a valid, unexpired token as used and
// returns its owner. Reuse is impossible: a second consumer finds used_at set.
func (d *DB) ConsumeOneTimeToken(ctx context.Context, tokenHash string, purpose TokenPurpose) (string, error) {
	var userID string
	err := d.Pool.QueryRow(ctx, `
		UPDATE one_time_tokens SET used_at = now()
		WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
		RETURNING user_id`, tokenHash, string(purpose)).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return userID, err
}

// InvalidateTokensForUser drops outstanding tokens of a purpose (a new reset
// request supersedes older links — reuse detection by family).
func (d *DB) InvalidateTokensForUser(ctx context.Context, userID string, purpose TokenPurpose) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE one_time_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
		userID, string(purpose))
	return fmt.Errorf("invalidateTokensForUser: %w", err)
}

// CleanupExpired removes stale rows. Invoked periodically by the server loop;
// keeps sessions, CSRF secrets and tokens from accumulating forever.
func (d *DB) CleanupExpired(ctx context.Context) error {
	stmts := []string{
		`DELETE FROM auth_sessions WHERE expires_at < now() - interval '30 days' OR absolute_expires_at < now() - interval '7 days'`,
		`DELETE FROM one_time_tokens WHERE expires_at < now() - interval '7 days'`,
		`DELETE FROM auth_csrf_secrets WHERE expires_at < now() - interval '1 day'`,
	}
	for _, s := range stmts {
		if _, err := d.Pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("cleanupExpired: %w", err)
		}
	}
	return nil
}
