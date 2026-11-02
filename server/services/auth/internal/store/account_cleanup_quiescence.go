package store

import (
	"context"
	"errors"
	"time"
)

// RecordCleanupQuiescence starts the assertion-expiry clock. This is for the
// single-host offline operator tool only; callers must first stop every app and
// identity process and drain all in-flight work. Repeated calls reset the clock.
func (d *DB) RecordCleanupQuiescence(ctx context.Context, operationID string) error {
	tag, err := d.Pool.Exec(ctx, `UPDATE account_cleanup_operations SET quiescent_since=clock_timestamp(),updated_at=now()
 WHERE id=$1 AND status='fencing' AND EXISTS (SELECT 1 FROM users WHERE id=account_cleanup_operations.user_id AND is_active=false)
 AND NOT EXISTS (SELECT 1 FROM auth_sessions WHERE user_id=account_cleanup_operations.user_id AND revoked_at IS NULL)`, operationID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("cleanup is not ready for quiescence")
	}
	return nil
}

// ActivateQuiescentCleanup releases work only after the operator-supplied
// maximum lifetime of every previously issued assertion, plus clock skew, has
// elapsed. It never infers that services are stopped; the caller must prove it.
func (d *DB) ActivateQuiescentCleanup(ctx context.Context, operationID string, maximumAssertionAge time.Duration) error {
	if maximumAssertionAge < 5*time.Minute || maximumAssertionAge > 30*24*time.Hour {
		return errors.New("assertion maximum age must be between five minutes and thirty days")
	}
	seconds := int64((maximumAssertionAge + time.Minute + time.Second - 1) / time.Second)
	tag, err := d.Pool.Exec(ctx, `UPDATE account_cleanup_operations SET status='pending',next_attempt_at=now(),updated_at=now()
 WHERE id=$1 AND status='fencing' AND quiescent_since IS NOT NULL
 AND quiescent_since+($2 * interval '1 second') <= clock_timestamp()
 AND EXISTS (SELECT 1 FROM users WHERE id=account_cleanup_operations.user_id AND is_active=false)
 AND NOT EXISTS (SELECT 1 FROM auth_sessions WHERE user_id=account_cleanup_operations.user_id AND revoked_at IS NULL)
 AND (SELECT count(*) FROM account_cleanup_steps WHERE operation_id=account_cleanup_operations.id)=3`, operationID, seconds)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("cleanup is not quiescent or the assertion expiry period has not elapsed")
	}
	return nil
}
