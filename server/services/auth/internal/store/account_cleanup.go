package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

var ErrCleanupOperationMismatch = errors.New("account cleanup operation does not match user")

// BeginAccountCleanup creates a durable fencing operation, deactivates the
// account and revokes sessions in one transaction. It returns all session hashes
// so the caller can repeatedly invalidate caches and live sockets after crashes.
// This does not establish a write fence by itself: cached assertions and active
// requests must be drained before any domain cleanup can begin. No public route
// calls this until that barrier and the durable dispatcher are implemented.
func (d *DB) BeginAccountCleanup(ctx context.Context, userID, operationID string) ([]string, error) {
	var hashes []string
	err := d.WithTx(ctx, func(tx pgx.Tx) error {
		var existingUser string
		err := tx.QueryRow(ctx, `SELECT user_id FROM account_cleanup_operations WHERE id = $1`, operationID).Scan(&existingUser)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err == nil && existingUser != userID {
			return ErrCleanupOperationMismatch
		}
		if errors.Is(err, pgx.ErrNoRows) {
			var lockedID string
			if err := tx.QueryRow(ctx, `SELECT id FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&lockedID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return ErrNotFound
				}
				return err
			}
			// The user lock serializes concurrent starts, including retries of the
			// same operation that both observed no row before taking the lock.
			var existingOperation string
			err := tx.QueryRow(ctx, `SELECT id::text FROM account_cleanup_operations WHERE user_id = $1`, userID).Scan(&existingOperation)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			if err == nil && !strings.EqualFold(existingOperation, operationID) {
				return ErrCleanupOperationMismatch
			}
			if errors.Is(err, pgx.ErrNoRows) {
				if _, err := tx.Exec(ctx, `INSERT INTO account_cleanup_operations(id,user_id) VALUES($1,$2)`, operationID, userID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO account_cleanup_steps(operation_id,service) VALUES($1,'workspace'),($1,'ai'),($1,'team')`, operationID); err != nil {
					return err
				}
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET is_active = false, updated_at = now() WHERE id = $1`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at,now()) WHERE user_id = $1`, userID); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT id_hash FROM auth_sessions WHERE user_id = $1`, userID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var hash string
			if err := rows.Scan(&hash); err != nil {
				return err
			}
			hashes = append(hashes, hash)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("begin account cleanup: %w", err)
	}
	return hashes, nil
}
