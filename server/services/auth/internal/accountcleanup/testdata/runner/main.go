// Test-only worker process for the cross-service system test.
package main

import (
	"context"
	"fmt"
	"github.com/meshwork-studio/auth/internal/accountcleanup"
	"github.com/meshwork-studio/auth/internal/store"
	"os"
	"time"
)

func run() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	db, err := store.Connect(ctx, os.Getenv("AUTH_TEST_DATABASE_URL"))
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		return err
	}
	const operation = "bb58910d-3bf7-40cf-9cde-6f3992b09a91"
	switch os.Getenv("CLEANUP_TEST_MODE") {
	case "seed":
		if _, err := db.Pool.Exec(ctx, `INSERT INTO users(id,email,email_normalized,is_active) VALUES ('user','cleanup@example.test','cleanup@example.test',true)`); err != nil {
			return err
		}
		if _, err := db.BeginAccountCleanup(ctx, "user", operation); err != nil {
			return err
		}
		// Test-only transition: this test exercises delivery, not the offline fence.
		_, err = db.Pool.Exec(ctx, `UPDATE account_cleanup_operations SET status='pending' WHERE id=$1`, operation)
		return err
	case "run":
		transport, err := accountcleanup.NewHTTPTransport(os.Getenv("CLEANUP_TEST_BRIDGE_URL"), "test-node-key")
		if err != nil {
			return err
		}
		return (accountcleanup.Worker{Store: store.CleanupQueue{DB: db}, Transport: transport}).RunOnce(ctx)
	default:
		return fmt.Errorf("invalid test mode")
	}
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
