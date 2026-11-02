package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meshwork-studio/auth/internal/accountcleanup"
	"github.com/meshwork-studio/auth/internal/session"
	"net/http"
	"net/http/httptest"
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
		sessions := session.NewStore(pool, nil, time.Hour, time.Hour, time.Minute)
		if _, _, err := sessions.Create(ctx, session.CreateInput{UserID: "eligible"}); !errors.Is(err, session.ErrInactiveAccount) {
			t.Fatalf("inactive user created session: %v", err)
		}
		creation := make(chan error, 1)
		cleanup := make(chan error, 1)
		go func() { _, _, err := sessions.Create(ctx, session.CreateInput{UserID: "unverified"}); creation <- err }()
		go func() {
			_, err := db.BeginAccountCleanup(ctx, "unverified", "bb58910d-3bf7-40cf-9cde-6f3992b09a35")
			cleanup <- err
		}()
		if err := <-cleanup; err != nil {
			t.Fatal(err)
		}
		if err := <-creation; err != nil && !errors.Is(err, session.ErrInactiveAccount) {
			t.Fatal(err)
		}
		var activeSessions int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth_sessions WHERE user_id='unverified' AND revoked_at IS NULL`).Scan(&activeSessions); err != nil {
			t.Fatal(err)
		}
		if activeSessions != 0 {
			t.Fatalf("cleanup left %d active sessions", activeSessions)
		}

		if _, err := pool.Exec(ctx, `INSERT INTO users(id,email,email_normalized,is_active) VALUES ('rollback','rollback@example.test','rollback@example.test',true)`); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `ALTER TABLE account_cleanup_steps ADD CONSTRAINT reject_cleanup CHECK (false) NOT VALID`); err != nil {
			t.Fatal(err)
		}
		_, err = db.BeginAccountCleanup(ctx, "rollback", "bb58910d-3bf7-40cf-9cde-6f3992b09a36")
		if err == nil {
			t.Fatal("expected cleanup insert failure")
		}
		var rollbackActive bool
		var operations int
		if err := pool.QueryRow(ctx, `SELECT is_active FROM users WHERE id='rollback'`).Scan(&rollbackActive); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM account_cleanup_operations WHERE user_id='rollback'`).Scan(&operations); err != nil {
			t.Fatal(err)
		}
		if !rollbackActive || operations != 0 {
			t.Fatalf("cleanup failure did not roll back: active=%v operations=%d", rollbackActive, operations)
		}
		if _, err := pool.Exec(ctx, `ALTER TABLE account_cleanup_steps DROP CONSTRAINT reject_cleanup`); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("cleanup queue fences stale workers and finalizes only inactive accounts", func(t *testing.T) {
		_, err := pool.Exec(ctx, `INSERT INTO users(id,email,email_normalized,is_active) VALUES ('queue','queue@example.test','queue@example.test',true)`)
		if err != nil {
			t.Fatal(err)
		}
		_, err = pool.Exec(ctx, `INSERT INTO auth_sessions(id_hash,user_id,expires_at,absolute_expires_at) VALUES ('queue-session','queue',now()+interval '1 hour',now()+interval '1 hour'); INSERT INTO auth_csrf_secrets(session_id_hash,secret_hash,expires_at) VALUES ('queue-session','hash',now()+interval '1 hour'); INSERT INTO audit_events(user_id,event) VALUES ('queue','test')`)
		if err != nil {
			t.Fatal(err)
		}
		operationID := "bb58910d-3bf7-40cf-9cde-6f3992b09a37"
		if _, err := db.BeginAccountCleanup(ctx, "queue", operationID); err != nil {
			t.Fatal(err)
		}
		queue := CleanupQueue{DB: db}
		if claim, err := queue.Claim(ctx); err != nil || claim != nil {
			t.Fatalf("fencing operation was claimed: %v %v", claim, err)
		}
		// Test-only transition: production must establish the write fence first.
		if _, err := pool.Exec(ctx, `UPDATE account_cleanup_operations SET status='pending' WHERE id=$1`, operationID); err != nil {
			t.Fatal(err)
		}
		first, err := queue.Claim(ctx)
		if err != nil || first == nil {
			t.Fatalf("claim: %v %v", first, err)
		}
		if _, err := pool.Exec(ctx, `UPDATE account_cleanup_operations SET locked_until=now()-interval '1 second' WHERE id=$1`, operationID); err != nil {
			t.Fatal(err)
		}
		second, err := queue.Claim(ctx)
		if err != nil || second == nil || second.Token == first.Token {
			t.Fatalf("reclaim: %v %v", second, err)
		}
		if err := queue.CompleteStep(ctx, first, "workspace"); !errors.Is(err, ErrCleanupLeaseLost) {
			t.Fatalf("stale worker accepted: %v", err)
		}
		if allowed, err := queue.AuthorizeDelivery(ctx, first, "workspace"); err != nil || allowed {
			t.Fatalf("stale authorization: %v %v", allowed, err)
		}
		if allowed, err := queue.AuthorizeDelivery(ctx, second, "workspace"); err != nil || !allowed {
			t.Fatalf("current authorization: %v %v", allowed, err)
		}
		if allowed, err := queue.AuthorizeDelivery(ctx, second, "unknown"); err != nil || allowed {
			t.Fatalf("unknown service authorization: %v %v", allowed, err)
		}
		if err := queue.Finish(ctx, second); err == nil {
			t.Fatal("finished with incomplete steps")
		}
		for _, service := range []string{"workspace", "ai", "team"} {
			if err := queue.CompleteStep(ctx, second, service); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := pool.Exec(ctx, `UPDATE users SET is_active=true WHERE id='queue'`); err != nil {
			t.Fatal(err)
		}
		if err := queue.Finish(ctx, second); err == nil {
			t.Fatal("finished with active user")
		}
		var csrfCount int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth_csrf_secrets WHERE session_id_hash='queue-session'`).Scan(&csrfCount); err != nil || csrfCount != 1 {
			t.Fatalf("failed finalization did not roll back: %d %v", csrfCount, err)
		}
		if _, err := pool.Exec(ctx, `UPDATE users SET is_active=false WHERE id='queue'`); err != nil {
			t.Fatal(err)
		}
		if err := queue.Finish(ctx, second); err != nil {
			t.Fatal(err)
		}
		var users, csrf, audit int
		var status string
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id='queue'`).Scan(&users); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth_csrf_secrets WHERE session_id_hash='queue-session'`).Scan(&csrf); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM audit_events WHERE user_id='queue'`).Scan(&audit); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT status FROM account_cleanup_operations WHERE id=$1`, operationID).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if users != 0 || csrf != 0 || audit != 1 || status != "completed" {
			t.Fatalf("users=%d csrf=%d audit=%d status=%s", users, csrf, audit, status)
		}
	})

	t.Run("worker resumes published cleanup through authenticated transport", func(t *testing.T) {
		if _, err := pool.Exec(ctx, `INSERT INTO users(id,email,email_normalized,is_active) VALUES ('worker','worker@example.test','worker@example.test',true)`); err != nil {
			t.Fatal(err)
		}
		operationID := "bb58910d-3bf7-40cf-9cde-6f3992b09a38"
		if _, err := db.BeginAccountCleanup(ctx, "worker", operationID); err != nil {
			t.Fatal(err)
		}
		// Test-only: never bypass the real write fence in production.
		if _, err := pool.Exec(ctx, `UPDATE account_cleanup_operations SET status='pending' WHERE id=$1`, operationID); err != nil {
			t.Fatal(err)
		}
		queue := CleanupQueue{DB: db}
		workspaceComplete := false
		bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Internal-Key") != "node-key" {
				http.Error(w, "forbidden", 403)
				return
			}
			var body struct {
				OperationID string `json:"operationId"`
				UserID      string `json:"userId"`
				Token       string `json:"claimToken"`
				Service     string `json:"service"`
			}
			if json.NewDecoder(r.Body).Decode(&body) != nil {
				http.Error(w, "invalid", 400)
				return
			}
			allowed, err := queue.AuthorizeDelivery(r.Context(), &accountcleanup.Claim{OperationID: body.OperationID, UserID: body.UserID, Token: body.Token}, body.Service)
			if err != nil || !allowed {
				http.Error(w, "forbidden", 403)
				return
			}
			status := "completed"
			if body.Service == "workspace" && !workspaceComplete {
				status = "published"
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"operationId": body.OperationID, "status": status})
		}))
		defer bridge.Close()
		transport, err := accountcleanup.NewHTTPTransport(bridge.URL, "node-key")
		if err != nil {
			t.Fatal(err)
		}
		worker := accountcleanup.Worker{Store: queue, Transport: transport}
		if err := worker.RunOnce(ctx); err != nil {
			t.Fatal(err)
		}
		var status string
		if err := pool.QueryRow(ctx, `SELECT status FROM account_cleanup_operations WHERE id=$1`, operationID).Scan(&status); err != nil || status != "pending" {
			t.Fatalf("queued cleanup settled early: %s %v", status, err)
		}
		workspaceComplete = true
		if _, err := pool.Exec(ctx, `UPDATE account_cleanup_operations SET next_attempt_at=now() WHERE id=$1`, operationID); err != nil {
			t.Fatal(err)
		}
		if err := worker.RunOnce(ctx); err != nil {
			t.Fatal(err)
		}
		var users int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id='worker'`).Scan(&users); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT status FROM account_cleanup_operations WHERE id=$1`, operationID).Scan(&status); err != nil || status != "completed" || users != 0 {
			t.Fatalf("cleanup did not finish: %s users=%d err=%v", status, users, err)
		}
	})

}
