// Package lockout implements atomic, per-account brute-force lockout with a
// sliding failure window and exponential backoff. Counters live in Postgres,
// shared by every replica; per-IP throttling is handled by the ratelimit
// package in Redis.
package lockout

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxFailures     = 5
	baseLockMinutes = 15
	maxLockMinutes  = 480 // 8h ceiling
	window          = 15 * time.Minute
)

var ErrLocked = errors.New("account locked")

type Result struct {
	Failures    int
	Locked      bool
	LockedUntil time.Time
}

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Check reports whether the account is currently locked. Expired locks are
// cleared lazily on read.
func (s *Store) Check(ctx context.Context, emailNormalized string) (bool, error) {
	var lockedUntil *time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT locked_until FROM login_attempts WHERE email = $1`, emailNormalized).
		Scan(&lockedUntil)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check: %w", err)
	}
	if lockedUntil == nil {
		return false, nil
	}
	if lockedUntil.After(time.Now()) {
		return true, nil
	}
	// Lock expired: reset the counter window.
	_, _ = s.pool.Exec(ctx,
		`UPDATE login_attempts SET failed = 0, locked_until = NULL, window_started_at = now() WHERE email = $1`,
		emailNormalized)
	return false, nil
}

// RecordFailure atomically increments the failure counter inside a sliding
// window. The increment itself is a single UPSERT — concurrent failures can
// never lose counts. When the threshold is crossed, an exponential-backoff
// lock is applied.
func (s *Store) RecordFailure(ctx context.Context, emailNormalized string) (Result, error) {
	var (
		failures    int
		windowStart time.Time
	)
	err := s.pool.QueryRow(ctx, `
		INSERT INTO login_attempts (email, failed, last_attempt, window_started_at)
		VALUES ($1, 1, now(), now())
		ON CONFLICT (email) DO UPDATE SET
			failed = CASE
				WHEN login_attempts.window_started_at < now() - interval '15 minutes' THEN 1
				ELSE login_attempts.failed + 1 END,
			last_attempt = now(),
			window_started_at = CASE
				WHEN login_attempts.window_started_at < now() - interval '15 minutes' THEN now()
				ELSE login_attempts.window_started_at END
		RETURNING failed, window_started_at`,
		emailNormalized).Scan(&failures, &windowStart)
	if err != nil {
		return Result{}, fmt.Errorf("register: %w", err)
	}

	res := Result{Failures: failures}
	if failures > maxFailures {
		minutes := backoffMinutes(failures)
		res.Locked = true
		res.LockedUntil = time.Now().Add(time.Duration(minutes) * time.Minute)
		_, err = s.pool.Exec(ctx,
			`UPDATE login_attempts SET locked_until = $2 WHERE email = $1`,
			emailNormalized, res.LockedUntil)
		if err != nil {
			return res, fmt.Errorf("register: %w", err)
		}
	}
	return res, nil
}

// Reset clears failures after a successful authentication.
func (s *Store) Reset(ctx context.Context, emailNormalized string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM login_attempts WHERE email = $1`, emailNormalized)
	return fmt.Errorf("reset: %w", err)
}

// backoffMinutes: 6th failure → 15m, then doubling, capped at 8h.
// At or below the threshold no lock applies (0 minutes).
func backoffMinutes(failures int) int {
	if failures <= maxFailures {
		return 0
	}
	exponent := failures - maxFailures - 1
	minutes := baseLockMinutes << exponent
	if minutes > maxLockMinutes || minutes <= 0 {
		return maxLockMinutes
	}
	return minutes
}
