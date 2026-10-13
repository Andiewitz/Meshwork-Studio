package store

import (
	"context"
	"fmt"
	"time"

	"github.com/meshwork-studio/auth/internal/audit"
	"github.com/meshwork-studio/auth/internal/csrf"
)

// Adapter: store.DB implements csrf.SecretStore.
var _ csrf.SecretStore = (*DB)(nil)

func (d *DB) Save(ctx context.Context, sessionIDHash, secretHash string, expiresAt time.Time) error {
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO auth_csrf_secrets (session_id_hash, secret_hash, expires_at)
		VALUES ($1,$2,$3)
		ON CONFLICT (session_id_hash) DO UPDATE SET secret_hash = $2, expires_at = $3`,
		sessionIDHash, secretHash, expiresAt)
	return fmt.Errorf("save: %w", err)
}

func (d *DB) Find(ctx context.Context, sessionIDHash string) (string, time.Time, error) {
	var (
		hash      string
		expiresAt time.Time
	)
	err := d.Pool.QueryRow(ctx,
		`SELECT secret_hash, expires_at FROM auth_csrf_secrets WHERE session_id_hash = $1`,
		sessionIDHash).Scan(&hash, &expiresAt)
	return hash, expiresAt, err
}

// Adapter: audit.Store satisfied by InsertAudit above.

// Insert satisfies audit.Store (delegates to InsertAudit in tokens.go).
func (d *DB) Insert(ctx context.Context, e audit.Entry) error {
	return d.InsertAudit(ctx, e)
}
