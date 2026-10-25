package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Record is a stored session. IDHash is the SHA-256 of the raw cookie token;
// the raw token is never persisted.
type Record struct {
	IDHash            string     `json:"idHash"`
	UserID            string     `json:"userId"`
	CreatedAt         time.Time  `json:"createdAt"`
	LastSeenAt        time.Time  `json:"lastSeenAt"`
	ExpiresAt         time.Time  `json:"expiresAt"`
	AbsoluteExpiresAt time.Time  `json:"absoluteExpiresAt"`
	RevokedAt         *time.Time `json:"-"`
	UserAgent         *string    `json:"userAgent,omitempty"`
	IPHash            *string    `json:"ipHash,omitempty"`
}

func (r *Record) Active(now time.Time) bool {
	return r.RevokedAt == nil &&
		r.ExpiresAt.After(now) &&
		r.AbsoluteExpiresAt.After(now)
}

type Store struct {
	pool       *pgxpool.Pool
	rdb        redis.UniversalClient
	idleTTL    time.Duration
	absolute   time.Duration
	touchEvery time.Duration
	cacheTTL   time.Duration

	cacheHits   func()
	cacheMisses func()
}

func NewStore(pool *pgxpool.Pool, rdb redis.UniversalClient, idleTTL, absolute, touchEvery time.Duration) *Store {
	return &Store{
		pool:       pool,
		rdb:        rdb,
		idleTTL:    idleTTL,
		absolute:   absolute,
		touchEvery: touchEvery,
		cacheTTL:   60 * time.Second,
	}
}

// SetMetricsHooks wires optional prometheus counters for cache behaviour.
func (s *Store) SetMetricsHooks(hits, misses func()) {
	s.cacheHits, s.cacheMisses = hits, misses
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return base64.RawStdEncoding.EncodeToString(sum[:])
}

// NewToken returns (rawToken, hash). 256 bits of CSPRNG entropy.
func NewToken() (string, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("read random bytes: %w", err)
	}
	raw := base64.RawURLEncoding.EncodeToString(b)
	return raw, HashToken(raw), nil
}

type CreateInput struct {
	UserID    string
	UserAgent *string
	IPHash    *string
}

// Create inserts a fresh session row and primes the cache.
func (s *Store) Create(ctx context.Context, in CreateInput) (*Record, string, error) {
	raw, hash, err := NewToken()
	if err != nil {
		return nil, "", err
	}
	now := time.Now()
	rec := &Record{
		IDHash:            hash,
		UserID:            in.UserID,
		CreatedAt:         now,
		LastSeenAt:        now,
		ExpiresAt:         now.Add(s.idleTTL),
		AbsoluteExpiresAt: now.Add(s.absolute),
		UserAgent:         in.UserAgent,
		IPHash:            in.IPHash,
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO auth_sessions
			(id_hash, user_id, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent, ip_hash)
		VALUES ($1,$2,$3,$3,$4,$5,$6,$7)`,
		rec.IDHash, rec.UserID, rec.CreatedAt, rec.ExpiresAt, rec.AbsoluteExpiresAt, rec.UserAgent, rec.IPHash)
	if err != nil {
		return nil, "", fmt.Errorf("insert session: %w", err)
	}
	s.primeCache(ctx, rec)
	return rec, raw, nil
}

// Rotate revokes the old token (if any) and creates a replacement in one
// transaction — login and register always rotate to bound fixation risk.
func (s *Store) Rotate(ctx context.Context, oldRawToken string, in CreateInput) (*Record, string, error) {
	if oldRawToken != "" {
		oldHash := HashToken(oldRawToken)
		if _, err := s.pool.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = now() WHERE id_hash = $1 AND revoked_at IS NULL`,
			oldHash); err != nil {
			return nil, "", fmt.Errorf("revoke old session: %w", err)
		}
		s.invalidateCache(ctx, oldHash)
	}
	return s.Create(ctx, in)
}

var ErrInvalidSession = errors.New("invalid session")
var ErrNotFound = errors.New("session not found")

// Validate resolves the session behind a raw cookie token. Postgres is the
// source of truth; Redis only accelerates the hot path. A cache hit still
// carries the expiry windows so idle timeout is honoured without the DB.
func (s *Store) Validate(ctx context.Context, rawToken string) (*Record, error) {
	if len(rawToken) < 16 {
		return nil, ErrInvalidSession
	}
	hash := HashToken(rawToken)
	now := time.Now()

	if s.rdb != nil {
		if data, err := s.rdb.Get(ctx, "sess:"+hash).Bytes(); err == nil {
			var rec Record
			if json.Unmarshal(data, &rec) == nil && rec.Active(now) {
				if s.cacheHits != nil {
					s.cacheHits()
				}
				s.touchThrottled(ctx, &rec, now)
				return &rec, nil
			}
		} else if s.cacheMisses != nil {
			s.cacheMisses()
		}
	}

	rec, err := s.getFromDB(ctx, hash)
	if err != nil {
		return nil, err
	}
	if !rec.Active(now) {
		return nil, ErrInvalidSession
	}
	s.primeCache(ctx, rec)
	s.touchThrottled(ctx, rec, now)
	return rec, nil
}

func (s *Store) getFromDB(ctx context.Context, hash string) (*Record, error) {
	var rec Record
	err := s.pool.QueryRow(ctx, `
		SELECT id_hash, user_id, created_at, last_seen_at, expires_at,
		       COALESCE(absolute_expires_at, expires_at + interval '7 days'),
		       revoked_at, user_agent, ip_hash
		FROM auth_sessions WHERE id_hash = $1`, hash).
		Scan(&rec.IDHash, &rec.UserID, &rec.CreatedAt, &rec.LastSeenAt,
			&rec.ExpiresAt, &rec.AbsoluteExpiresAt, &rec.RevokedAt, &rec.UserAgent, &rec.IPHash)
	if errors.Is(err, context.Canceled) {
		return nil, err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvalidSession
	}
	if err != nil {
		return nil, fmt.Errorf("getFromDB: %w", err)
	}
	return &rec, nil
}

func (s *Store) primeCache(ctx context.Context, rec *Record) {
	if s.rdb == nil {
		return
	}
	data, err := json.Marshal(rec)
	if err != nil {
		return
	}
	ttl := time.Until(rec.ExpiresAt)
	if ttl > s.cacheTTL {
		ttl = s.cacheTTL
	}
	if ttl <= 0 {
		return
	}
	if err := s.rdb.Set(ctx, "sess:"+rec.IDHash, data, ttl).Err(); err != nil {
		slog.Warn("session cache write failed", "err", err)
	}
}

func (s *Store) invalidateCache(ctx context.Context, hashes ...string) {
	if s.rdb == nil || len(hashes) == 0 {
		return
	}
	keys := make([]string, len(hashes))
	for i, h := range hashes {
		keys[i] = "sess:" + h
	}
	if err := s.rdb.Del(ctx, keys...).Err(); err != nil {
		slog.Warn("session cache invalidation failed", "err", err)
	}
}

// touchThrottled updates last_seen / sliding expiry at most once per
// TouchEvery window — this removes the old write-per-request hotspot.
func (s *Store) touchThrottled(ctx context.Context, rec *Record, now time.Time) {
	if now.Sub(rec.LastSeenAt) < s.touchEvery {
		return
	}
	newIdle := now.Add(s.idleTTL)
	capAt := rec.AbsoluteExpiresAt
	if newIdle.After(capAt) {
		newIdle = capAt
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE auth_sessions
		SET last_seen_at = $2, expires_at = $3
		WHERE id_hash = $1 AND revoked_at IS NULL`,
		rec.IDHash, now, newIdle)
	if err != nil {
		slog.Warn("session touch failed", "err", err)
		return
	}
	if tag.RowsAffected() > 0 {
		rec.LastSeenAt = now
		rec.ExpiresAt = newIdle
		s.primeCache(ctx, rec)
	}
}

// Revoke marks one session revoked and drops it from caches.
func (s *Store) Revoke(ctx context.Context, rawToken string) error {
	if rawToken == "" {
		return nil
	}
	hash := HashToken(rawToken)
	_, err := s.pool.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = now() WHERE id_hash = $1 AND revoked_at IS NULL`, hash)
	s.invalidateCache(ctx, hash)
	s.publishRevocation(ctx, "", []string{hash})
	if err != nil {
		return fmt.Errorf("revoke: %w", err)
	}
	return nil
}

// RevokeByID revokes a specific session owned by userID.
func (s *Store) RevokeByID(ctx context.Context, userID, idHash string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = now() WHERE id_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
		idHash, userID)
	s.invalidateCache(ctx, idHash)
	s.publishRevocation(ctx, userID, []string{idHash})
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("revokeByID: %w", err)
	}
	return nil
}

// RevokeAllForUser revokes every active session of a user except optionally
// the current one, returning the affected hashes.
func (s *Store) RevokeAllForUser(ctx context.Context, userID string, exceptIDHash string) (int, error) {
	rows, err := s.pool.Query(ctx, `
		UPDATE auth_sessions SET revoked_at = now()
		WHERE user_id = $1 AND revoked_at IS NULL
		  AND ($2::varchar IS NULL OR id_hash <> $2)
		RETURNING id_hash`, userID, exceptIDHash)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	hashes := []string{}
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			return 0, err
		}
		hashes = append(hashes, h)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	s.invalidateCache(ctx, hashes...)
	s.publishRevocation(ctx, userID, hashes)
	return len(hashes), nil
}

func (s *Store) ListActiveForUser(ctx context.Context, userID string) ([]Record, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id_hash, user_id, created_at, last_seen_at, expires_at,
		       COALESCE(absolute_expires_at, expires_at + interval '7 days'),
		       revoked_at, user_agent, ip_hash
		FROM auth_sessions
		WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
		ORDER BY last_seen_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Record{}
	for rows.Next() {
		var r Record
		if err := rows.Scan(&r.IDHash, &r.UserID, &r.CreatedAt, &r.LastSeenAt,
			&r.ExpiresAt, &r.AbsoluteExpiresAt, &r.RevokedAt, &r.UserAgent, &r.IPHash); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// publishRevocation notifies every process (monolith WS included) that these
// sessions died so live sockets can be closed promptly.
func (s *Store) publishRevocation(ctx context.Context, userID string, hashes []string) {
	if s.rdb == nil || len(hashes) == 0 {
		return
	}
	payload, _ := json.Marshal(map[string]any{"userId": userID, "idHashes": hashes})
	if err := s.rdb.Publish(ctx, RevocationChannel, payload).Err(); err != nil {
		slog.Warn("revocation publish failed", "err", err)
	}
}

// RevocationChannel is the Redis pub/sub channel other services subscribe to.
const RevocationChannel = "identity:sessions:revoked"
