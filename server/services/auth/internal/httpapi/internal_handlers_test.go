package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meshwork-studio/auth/internal/store"
)

// Run the real handlers/credential checks. A pool BeforeConnect hook refuses
// all database connections, so accepted keys reach a controlled 500 instead of
// requiring PostgreSQL or accidentally touching developer data.
func TestInternalHandlersRequireTheIdentityCredential(t *testing.T) {
	previous := internalKeyValue
	internalKeyValue = "identity-only-key"
	t.Cleanup(func() { internalKeyValue = previous })
	cfg, err := pgxpool.ParseConfig("postgres://test:test@127.0.0.1:1/test?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	var connects atomic.Int32
	cfg.BeforeConnect = func(context.Context, *pgx.ConnConfig) error {
		connects.Add(1)
		return errors.New("database disabled by test")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	s := &Server{db: &store.DB{Pool: pool}, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	for _, endpoint := range []struct {
		path    string
		handler http.HandlerFunc
	}{
		{"/internal/stats/users", s.handleUserStats},
		{"/internal/audit-search?request_id=ab-cd", s.handleAuditSearch},
	} {
		t.Run(endpoint.path, func(t *testing.T) {
			for _, key := range []string{"", "different-node-key", "wrong"} {
				before := connects.Load()
				req := httptest.NewRequest("GET", endpoint.path, nil)
				req.Header.Set("X-Internal-Key", key)
				rec := httptest.NewRecorder()
				endpoint.handler(rec, req)
				if rec.Code != http.StatusUnauthorized || decodeBody(t, rec)["code"] != "INTERNAL_AUTH" {
					t.Fatalf("non-identity credential accepted: status %d", rec.Code)
				}
				if connects.Load() != before {
					t.Fatal("rejected credential reached the database")
				}
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			req := httptest.NewRequest("GET", endpoint.path, nil).WithContext(ctx)
			req.Header.Set("X-Internal-Key", "identity-only-key")
			rec := httptest.NewRecorder()
			before := connects.Load()
			endpoint.handler(rec, req)
			if rec.Code != http.StatusInternalServerError || decodeBody(t, rec)["code"] != "INTERNAL" {
				t.Fatalf("correct key did not reach the controlled database failure: %d", rec.Code)
			}
			if connects.Load() <= before {
				t.Fatal("correct identity credential did not reach the database boundary")
			}
		})
	}
}
