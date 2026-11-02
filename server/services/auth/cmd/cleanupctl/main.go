// cleanupctl prepares a single-host, offline account cleanup operation. It is
// not an HTTP endpoint and must only be used while all app and auth processes
// have been fully stopped and their in-flight work has drained.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"strconv"
	"syscall"
	"time"

	"github.com/meshwork-studio/auth/internal/store"
)

func ensurePortClosed(port int) error {
	if port < 1 || port > 65535 {
		return errors.New("invalid local port")
	}
	dialer := net.Dialer{Timeout: time.Second}
	conn, err := dialer.DialContext(context.Background(), "tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if err == nil {
		_ = conn.Close()
		return fmt.Errorf("local service port %d is still accepting connections", port)
	}
	if !errors.Is(err, syscall.ECONNREFUSED) && !errors.Is(err, syscall.Errno(10061)) {
		return fmt.Errorf("cannot confirm local port %d is stopped", port)
	}
	return nil
}
func run(args []string) error {
	flags := flag.NewFlagSet("cleanupctl", flag.ContinueOnError)
	action := flags.String("action", "", "prepare or activate")
	user := flags.String("user-id", "", "identity user ID (prepare only)")
	operation := flags.String("operation-id", "", "existing operation ID")
	assertionAge := flags.Duration("assertion-max-age", 0, "maximum lifetime of any previously issued assertion (activate only)")
	nodePort := flags.Int("node-port", 5000, "local app port")
	authPort := flags.Int("auth-port", 8081, "local identity port")
	stopped := flags.Bool("single-host-services-stopped", false, "attest that all app and auth processes on the only host are stopped and drained")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if !*stopped {
		return errors.New("single-host-services-stopped is required; see the account cleanup runbook")
	}
	if *action != "prepare" && *action != "activate" {
		return errors.New("action must be prepare or activate")
	}
	if *action == "prepare" && *user == "" {
		return errors.New("user-id is required for prepare")
	}
	if *action == "activate" && (*operation == "" || *assertionAge == 0) {
		return errors.New("operation-id and assertion-max-age are required for activate")
	}
	if err := ensurePortClosed(*nodePort); err != nil {
		return err
	}
	if err := ensurePortClosed(*authPort); err != nil {
		return err
	}
	databaseURL := os.Getenv("AUTH_DATABASE_URL")
	if databaseURL == "" {
		return errors.New("AUTH_DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := store.Connect(ctx, databaseURL)
	if err != nil {
		return errors.New("identity database unavailable")
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		return fmt.Errorf("identity migration failed: %w", err)
	}
	switch *action {
	case "prepare":
		if *operation == "" {
			if err := db.Pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(operation); err != nil {
				return err
			}
		}
		if _, err := db.BeginAccountCleanup(ctx, *user, *operation); err != nil {
			return fmt.Errorf("prepare cleanup: %w", err)
		}
		if err := db.RecordCleanupQuiescence(ctx, *operation); err != nil {
			return fmt.Errorf("record quiescence: %w", err)
		}
		fmt.Printf("Cleanup operation %s is fenced. Keep services stopped until the maximum previously issued assertion lifetime plus one minute has elapsed.\n", *operation)
	case "activate":
		if configured := os.Getenv("AUTH_ASSERTION_TTL"); configured != "" {
			current, err := time.ParseDuration(configured)
			if err != nil || *assertionAge < current {
				return errors.New("assertion-max-age must cover the configured AUTH_ASSERTION_TTL")
			}
		}
		if err := db.ActivateQuiescentCleanup(ctx, *operation, *assertionAge); err != nil {
			return err
		}
		fmt.Printf("Cleanup operation %s is pending. The configured identity worker can resume it when services restart.\n", *operation)
	}
	return nil
}
func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
