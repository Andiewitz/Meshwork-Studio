// Package ratelimit provides Redis-backed sliding-window rate limiting.
// Counters are shared across replicas and survive restarts, unlike the
// in-memory store used previously. When Redis is configured but unreachable
// the middleware FAILS CLOSED on sensitive routes: a brute-force protection
// that silently disappears is worse than brief unavailability.
package ratelimit

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// allowScript atomically prunes the window, checks the limit, adds the
// current request and refreshes the TTL.
var allowScript = redis.NewScript(`
	local removed = redis.call('ZREMRANGEBYSCORE', KEYS[1], '0', ARGV[1])
	local n = redis.call('ZCARD', KEYS[1])
	local limit = tonumber(ARGV[2])
	if n >= limit then
		return -1
	end
	redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])
	redis.call('PEXPIRE', KEYS[1], ARGV[5])
	return limit - n - 1`)

type Limiter struct {
	rdb redis.UniversalClient
}

func New(rdb redis.UniversalClient) *Limiter { return &Limiter{rdb: rdb} }

// Allow consumes one slot for key within the sliding window. Returns the
// decision and remaining allowance. Atomic via a Lua script so concurrent
// requests cannot overshoot the limit.
func (l *Limiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, int, error) {
	if l.rdb == nil {
		return true, limit, nil
	}
	now := time.Now()
	res, err := allowScript.Run(ctx, l.rdb, []string{key},
		strconv.FormatInt(now.Add(-window).UnixMilli(), 10), // min score cutoff
		limit,
		strconv.FormatInt(now.UnixMilli(), 10),       // score
		fmt.Sprintf("%d", now.UnixNano()),            // unique member
		strconv.FormatInt(window.Milliseconds(), 10), // pexpire
	).Int64()
	if err != nil {
		return false, 0, err
	}
	if res < 0 {
		return false, 0, nil
	}
	return true, int(res), nil
}

func writeLimitError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	id := r.Header.Get("X-Request-Id")
	if id == "" {
		id = "unscoped"
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":      code,
		"message":   message,
		"requestId": id,
	})
}

// Middleware enforces limit per key over window on sensitive routes,
// failing closed when Redis is configured but erroring.
func (l *Limiter) Middleware(keyFn func(*http.Request) string, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if l.rdb != nil {
				ok, remaining, err := l.Allow(r.Context(), keyFn(r), limit, window)
				if err != nil {
					writeLimitError(w, r, http.StatusServiceUnavailable,
						"RATE_LIMIT_UNAVAILABLE", "Try again shortly")
					return
				}
				w.Header().Set("RateLimit-Limit", strconv.Itoa(limit))
				w.Header().Set("RateLimit-Remaining", strconv.Itoa(remaining))
				if !ok {
					w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
					writeLimitError(w, r, http.StatusTooManyRequests,
						"RATE_LIMITED", "Too many requests")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
