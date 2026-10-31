package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
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
}
