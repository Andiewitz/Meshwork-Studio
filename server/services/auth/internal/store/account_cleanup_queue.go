package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/meshwork-studio/auth/internal/accountcleanup"
)

var ErrCleanupLeaseLost = errors.New("account cleanup lease lost")

// CleanupQueue uses a lease and fencing token so a restarted or stalled worker
// cannot settle another worker's claim. Only already-fenced pending operations
// are claimable; operations in the initial fencing state are never dispatched.
type CleanupQueue struct{ DB *DB }

func (q CleanupQueue) Claim(ctx context.Context) (*accountcleanup.Claim, error) {
	var c accountcleanup.Claim
	err := q.DB.Pool.QueryRow(ctx, `WITH candidate AS (
  SELECT id FROM account_cleanup_operations WHERE status='pending' AND next_attempt_at <= now()
  AND (locked_until IS NULL OR locked_until <= clock_timestamp()) ORDER BY created_at
  FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE account_cleanup_operations AS op SET claim_token=gen_random_uuid(),
 locked_until=clock_timestamp()+interval '60 seconds', attempts=attempts+1, updated_at=now()
 FROM candidate WHERE op.id=candidate.id RETURNING op.id::text,op.user_id,op.claim_token::text`).Scan(&c.OperationID, &c.UserID, &c.Token)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}
func (q CleanupQueue) Steps(ctx context.Context, c *accountcleanup.Claim) ([]accountcleanup.Step, error) {
	rows, err := q.DB.Pool.Query(ctx, `SELECT s.service,s.status='completed' FROM account_cleanup_steps s
 JOIN account_cleanup_operations o ON o.id=s.operation_id
 WHERE o.id=$1 AND o.user_id=$2 AND o.claim_token=$3 AND o.status='pending' AND o.locked_until>clock_timestamp()
 ORDER BY CASE s.service WHEN 'workspace' THEN 0 WHEN 'ai' THEN 1 ELSE 2 END`, c.OperationID, c.UserID, c.Token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	steps := []accountcleanup.Step{}
	for rows.Next() {
		var s accountcleanup.Step
		if err := rows.Scan(&s.Service, &s.Completed); err != nil {
			return nil, err
		}
		steps = append(steps, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(steps) == 0 {
		return nil, ErrCleanupLeaseLost
	}
	return steps, nil
}
func (q CleanupQueue) Renew(ctx context.Context, c *accountcleanup.Claim) error {
	tag, err := q.DB.Pool.Exec(ctx, `UPDATE account_cleanup_operations SET locked_until=clock_timestamp()+interval '60 seconds'
 WHERE id=$1 AND user_id=$2 AND claim_token=$3 AND status='pending' AND locked_until>clock_timestamp()`, c.OperationID, c.UserID, c.Token)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrCleanupLeaseLost
	}
	return nil
}
func (q CleanupQueue) CompleteStep(ctx context.Context, c *accountcleanup.Claim, service string) error {
	return q.DB.WithTx(ctx, func(tx pgx.Tx) error {
		var id string
		err := tx.QueryRow(ctx, `SELECT id::text FROM account_cleanup_operations WHERE id=$1 AND user_id=$2 AND claim_token=$3 AND status='pending' AND locked_until>clock_timestamp() FOR UPDATE`, c.OperationID, c.UserID, c.Token).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrCleanupLeaseLost
		}
		if err != nil {
			return err
		}
		renewed, err := tx.Exec(ctx, `UPDATE account_cleanup_operations SET locked_until=clock_timestamp()+interval '60 seconds' WHERE id=$1 AND claim_token=$2 AND locked_until>clock_timestamp()`, c.OperationID, c.Token)
		if err != nil {
			return err
		}
		if renewed.RowsAffected() != 1 {
			return ErrCleanupLeaseLost
		}
		tag, err := tx.Exec(ctx, `UPDATE account_cleanup_steps SET status='completed',updated_at=now() WHERE operation_id=$1 AND service=$2`, c.OperationID, service)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return errors.New("account cleanup step not found")
		}
		return nil
	})
}
func (q CleanupQueue) Release(ctx context.Context, c *accountcleanup.Claim, reason string) error {
	if runes := []rune(reason); len(runes) > 1000 {
		reason = string(runes[:1000])
	}
	tag, err := q.DB.Pool.Exec(ctx, `UPDATE account_cleanup_operations SET claim_token=NULL,locked_until=NULL,
 next_attempt_at=now()+interval '5 seconds',last_error=NULLIF($4,''),updated_at=now()
 WHERE id=$1 AND user_id=$2 AND claim_token=$3 AND status='pending' AND locked_until>clock_timestamp()`, c.OperationID, c.UserID, c.Token, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrCleanupLeaseLost
	}
	return nil
}

// AuthorizeDelivery only permits the current fenced worker claim to dispatch
// an existing service step. The check is repeated for every delivery attempt.
func (q CleanupQueue) AuthorizeDelivery(ctx context.Context, c *accountcleanup.Claim, service string) (bool, error) {
	var allowed bool
	err := q.DB.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM account_cleanup_operations o JOIN account_cleanup_steps s ON s.operation_id=o.id WHERE o.id=$1 AND o.user_id=$2 AND o.claim_token=$3 AND o.status='pending' AND o.locked_until>clock_timestamp() AND s.service=$4)`, c.OperationID, c.UserID, c.Token, service).Scan(&allowed)
	return allowed, err
}

// Finish removes identity-owned records only after every owner confirms its
// cleanup. Security audit rows are retained; no public deletion route exists.
func (q CleanupQueue) Finish(ctx context.Context, c *accountcleanup.Claim) error {
	return q.DB.WithTx(ctx, func(tx pgx.Tx) error {
		var userID string
		err := tx.QueryRow(ctx, `SELECT user_id FROM account_cleanup_operations WHERE id=$1 AND user_id=$2
   AND claim_token=$3 AND status='pending' AND locked_until>clock_timestamp() FOR UPDATE`, c.OperationID, c.UserID, c.Token).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrCleanupLeaseLost
		}
		if err != nil {
			return err
		}
		var total, completed int
		if err := tx.QueryRow(ctx, `SELECT count(*),count(*) FILTER (WHERE status='completed') FROM account_cleanup_steps WHERE operation_id=$1`, c.OperationID).Scan(&total, &completed); err != nil {
			return err
		}
		if total != 3 || completed != 3 {
			return errors.New("account cleanup steps incomplete")
		}
		if _, err := tx.Exec(ctx, `DELETE FROM auth_csrf_secrets WHERE session_id_hash IN (SELECT id_hash FROM auth_sessions WHERE user_id=$1)`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM login_attempts WHERE email IN (SELECT email_normalized FROM users WHERE id=$1)`, userID); err != nil {
			return err
		}
		deleted, err := tx.Exec(ctx, `DELETE FROM users WHERE id=$1 AND is_active=false`, userID)
		if err != nil {
			return err
		}
		if deleted.RowsAffected() != 1 {
			return errors.New("cleanup subject is missing or active")
		}
		tag, err := tx.Exec(ctx, `UPDATE account_cleanup_operations SET status='completed',claim_token=NULL,locked_until=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND claim_token=$2 AND status='pending' AND locked_until>clock_timestamp()`, c.OperationID, c.Token)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return fmt.Errorf("finish cleanup: %w", ErrCleanupLeaseLost)
		}
		return nil
	})
}
