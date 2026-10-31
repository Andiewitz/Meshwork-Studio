package password

import (
	"context"
	"errors"
	"os"
	"runtime/debug"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// ErrBusy is returned when the hashing pool is saturated beyond its wait
// budget. Callers should surface it as HTTP 429/503 + Retry-After.
var ErrBusy = errors.New("password hashing pool saturated")

// The pool exists because every argon2id operation allocates m=64 MiB of
// scratch space (password.go). Unbounded concurrent logins therefore scale
// memory linearly with arrival rate: 16 concurrent verifications ≈ 1 GiB,
// which OOM-killed the container during load testing. Peak memory is now
// bounded by construction: base + AUTH_HASH_CONCURRENCY × 64 MiB.
var (
	hashSlots = make(chan struct{}, envInt("AUTH_HASH_CONCURRENCY", 4, 1, 16))
	hashWait  = time.Duration(envInt("AUTH_HASH_WAIT_MS", 2000, 0, 30000)) * time.Millisecond

	inFlight atomic.Int64

	hashInFlight = prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "identity_hash_ops_in_flight",
		Help: "Password hash/verify operations currently executing",
	}, func() float64 { return float64(inFlight.Load()) })

	hashRejected = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "identity_hash_ops_rejected_total",
		Help: "Hash operations rejected because the pool was saturated",
	})

	// lastDone records when the pool last finished an operation so the idle
	// reclaimer can return retained RSS to the OS exactly once per busy
	// period (Go otherwise keeps the freed argon2 scratch near the container
	// memory limit indefinitely).
	lastDone atomic.Int64
)

func init() {
	prometheus.MustRegister(hashInFlight, hashRejected)
	go idleReclaim()
}

func envInt(name string, def, min, max int) int {
	v, err := strconv.Atoi(os.Getenv(name))
	if err != nil || v < min || v > max {
		return def
	}
	return v
}

// acquire takes a hashing slot. It fails fast with ErrBusy when the wait
// budget is exhausted so a login storm sheds load instead of queueing
// unbounded memory.
func acquire(ctx context.Context) error {
	select {
	case hashSlots <- struct{}{}:
		inFlight.Add(1)
		return nil
	default:
	}
	if hashWait <= 0 {
		hashRejected.Inc()
		return ErrBusy
	}
	timer := time.NewTimer(hashWait)
	defer timer.Stop()
	select {
	case hashSlots <- struct{}{}:
		inFlight.Add(1)
		return nil
	case <-ctx.Done():
		hashRejected.Inc()
		return ErrBusy
	case <-timer.C:
		hashRejected.Inc()
		return ErrBusy
	}
}

func release() {
	<-hashSlots
	inFlight.Add(-1)
	lastDone.Store(time.Now().UnixNano())
}

func idleReclaim() {
	const interval = time.Minute
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		if inFlight.Load() != 0 {
			continue
		}
		last := lastDone.Load()
		if last == 0 || time.Since(time.Unix(0, last)) < interval {
			continue
		}
		debug.FreeOSMemory()
		lastDone.Store(0)
	}
}
