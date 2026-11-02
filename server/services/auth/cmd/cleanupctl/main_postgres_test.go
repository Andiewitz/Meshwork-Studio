package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meshwork-studio/auth/internal/store"
	"net/url"
	"os"
	"testing"
	"time"
)

func TestOfflineCleanupCommandsPostgres(t *testing.T) {
	connection := os.Getenv("AUTH_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("AUTH_TEST_DATABASE_URL not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		t.Fatal(err)
	}
	schema := "cleanupctl_test_" + hex.EncodeToString(b[:])
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = admin.Exec(context.Background(), "DROP SCHEMA "+identifier+" CASCADE") }()
	parsed, err := url.Parse(connection)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema+",public")
	parsed.RawQuery = query.Encode()
	t.Setenv("AUTH_DATABASE_URL", parsed.String())
	t.Setenv("AUTH_ASSERTION_TTL", "5m")
	db, err := store.Connect(ctx, parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO users(id,email,email_normalized,is_active) VALUES ('offline','offline@example.test','offline@example.test',true)`); err != nil {
		t.Fatal(err)
	}
	id := "2a58910d-3bf7-40cf-9cde-6f3992b09a33"
	common := []string{"-single-host-services-stopped", "-node-port=1", "-auth-port=2", "-operation-id=" + id}
	if err := run(append(common, "-action=prepare", "-user-id=offline")); err != nil {
		t.Fatal(err)
	}
	if err := run(append(common, "-action=activate", "-assertion-max-age=5m")); err == nil {
		t.Fatal("activated before assertion expiry")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE account_cleanup_operations SET quiescent_since=clock_timestamp()-interval '7 minutes' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err := run(append(common, "-action=activate", "-assertion-max-age=5m")); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := db.Pool.QueryRow(ctx, `SELECT status FROM account_cleanup_operations WHERE id=$1`, id).Scan(&status); err != nil || status != "pending" {
		t.Fatalf("status=%s err=%v", status, err)
	}
}
