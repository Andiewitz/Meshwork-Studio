package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"sync"
	"testing"
	"time"
)

// Use a disposable database; this test creates and drops a unique schema.
func TestFindEligibleUsersByIDsPostgres(t *testing.T) {
	url := os.Getenv("AUTH_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("AUTH_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	var random [12]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	schema := "auth_batch_test_" + hex.EncodeToString(random[:])
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = admin.Exec(context.Background(), "DROP SCHEMA "+identifier+" CASCADE") }()
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	db := &DB{Pool: pool}
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO users (id,email,email_normalized,is_active,email_verified_at)
 VALUES ('eligible','eligible@example.test','eligible@example.test',true,now()),
 ('inactive','inactive@example.test','inactive@example.test',false,now()),
 ('unverified','unverified@example.test','unverified@example.test',true,NULL)`)
	if err != nil {
		t.Fatal(err)
	}
	users, err := db.FindEligibleUsersByIDs(ctx, []string{"unverified", "eligible", "missing", "inactive", "eligible"})
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0].ID != "eligible" {
		t.Fatalf("unexpected eligible users: %#v", users)
	}
	users, err = db.FindEligibleUsersByIDs(ctx, nil)
	if err != nil || len(users) != 0 {
		t.Fatalf("empty batch: %v %v", users, err)
	}

	t.Run("account cleanup is transactional and replay safe", func(t *testing.T) {
		_, err := pool.Exec(ctx, `INSERT INTO auth_sessions(id_hash,user_id,expires_at,absolute_expires_at) VALUES ('test-session','eligible',now()+interval '1 hour',now()+interval '1 hour')`)
		if err != nil {
			t.Fatal(err)
		}
		operationID := "bb58910d-3bf7-40cf-9cde-6f3992b09a33"
		var wg sync.WaitGroup
		errs := make(chan error, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				hashes, err := db.BeginAccountCleanup(ctx, "eligible", operationID)
				if err == nil && (len(hashes) != 1 || hashes[0] != "test-session") {
					err = errors.New("missing session hash")
				}
				errs <- err
			}()
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil {
				t.Fatal(err)
			}
		}
		var active bool
		var revoked bool
		var steps int
		if err := pool.QueryRow(ctx, `SELECT is_active FROM users WHERE id='eligible'`).Scan(&active); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT revoked_at IS NOT NULL FROM auth_sessions WHERE id_hash='test-session'`).Scan(&revoked); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM account_cleanup_steps WHERE operation_id=$1`, operationID).Scan(&steps); err != nil {
			t.Fatal(err)
		}
		if active || !revoked || steps != 3 {
			t.Fatalf("active=%v revoked=%v steps=%d", active, revoked, steps)
		}
		if _, err := db.BeginAccountCleanup(ctx, "inactive", operationID); !errors.Is(err, ErrCleanupOperationMismatch) {
			t.Fatalf("unexpected mismatch error: %v", err)
		}
		if _, err := db.BeginAccountCleanup(ctx, "eligible", "bb58910d-3bf7-40cf-9cde-6f3992b09a34"); !errors.Is(err, ErrCleanupOperationMismatch) {
			t.Fatalf("unexpected duplicate error: %v", err)
		}
	})
}
