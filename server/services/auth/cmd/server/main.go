// Command identity runs the Meshwork identity service: sessions, passwords,
// MFA, OAuth and the audit trail for the whole platform.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/meshwork-studio/auth/internal/accountcleanup"
	"github.com/meshwork-studio/auth/internal/config"
	"github.com/meshwork-studio/auth/internal/httpapi"
	"github.com/meshwork-studio/auth/internal/store"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "run the container health probe and exit")
	flag.Parse()

	if *healthcheck {
		client := &http.Client{Timeout: 3 * time.Second}
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
			"http://127.0.0.1:"+envOr("AUTH_PORT", "8081")+"/healthz", nil)
		if err != nil {
			fmt.Fprintln(os.Stderr, "invalid healthcheck URL")
			os.Exit(1)
		}
		resp, err := client.Do(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			fmt.Fprintln(os.Stderr, "healthcheck failed")
			os.Exit(1)
		}
		if err := resp.Body.Close(); err != nil {
			fmt.Fprintln(os.Stderr, "healthcheck response close failed")
			os.Exit(1)
		}
		return
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration invalid — refusing to start", "errors", err.Error())
		os.Exit(1)
	}
	logger.Info("configuration validated",
		"env", cfg.AppEnv,
		"public_url", cfg.PublicURL,
		"session_absolute_ttl", cfg.AbsoluteTTL.String(),
		"session_idle_ttl", cfg.IdleTTL.String(),
		"captcha", cfg.CaptchaProvider != "",
		"oauth_google", cfg.GoogleClientID != "",
		"smtp", cfg.SMTPHost != "",
	)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := store.WaitForDatabase(ctx, db, 30*time.Second); err != nil {
		logger.Error("database unreachable at boot", "err", err)
		os.Exit(1)
	}
	if err := db.Migrate(ctx); err != nil {
		logger.Error("migrations failed — refusing to start", "err", err)
		os.Exit(1)
	}
	if n, err := db.PromoteBootstrapAdmins(ctx, cfg.BootstrapAdminEmails); err == nil && n > 0 {
		logger.Info("bootstrap admins promoted", "count", n)
	}

	var rdb redis.UniversalClient
	if cfg.RedisURL != "" {
		opts, perr := redis.ParseURL(cfg.RedisURL)
		if perr != nil {
			logger.Error("invalid redis url", "err", perr)
			os.Exit(1)
		}
		client := redis.NewClient(opts)
		pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		if perr := client.Ping(pingCtx).Err(); perr != nil {
			logger.Warn("redis ping failed — rate limiting and MFA tickets will fail closed",
				"err", perr)
		} else {
			logger.Info("redis connected")
			rdb = client
		}
		cancel()
		go func() {
			<-ctx.Done()
			_ = client.Close()
		}()
	} else {
		logger.Warn("AUTH_REDIS_URL not set — running without Redis; MFA and strict rate limits are DISABLED (development only)")
	}

	srv, err := httpapi.NewServer(cfg, db.Pool, rdb, logger)
	if err != nil {
		logger.Error("server construction failed", "err", err)
		os.Exit(1)
	}

	// Metrics bind to loopback only; scrape via a sidecar or SSH tunnel.
	metricsLn, err := (&net.ListenConfig{}).Listen(ctx, "tcp", "127.0.0.1:9091")
	if err == nil {
		metricsSrv := &http.Server{Handler: httpapi.MetricsHandler(), ReadHeaderTimeout: 5 * time.Second}
		go func() { _ = metricsSrv.Serve(metricsLn) }()
		defer func() {
			if err := metricsSrv.Close(); err != nil {
				logger.Warn("metrics shutdown failed", "err", err)
			}
		}()
		logger.Info("metrics listening on 127.0.0.1:9091/metrics")
	} else {
		logger.Warn("metrics listener unavailable", "err", err)
	}

	// Periodic retention cleanup of expired sessions/tokens/csrf secrets.
	go func() {
		t := time.NewTicker(6 * time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				cctx, cancel := context.WithTimeout(context.Background(), time.Minute)
				if err := db.CleanupExpired(cctx); err != nil {
					logger.Warn("cleanup failed", "err", err)
				}
				cancel()
			}
		}
	}()

	if cfg.CleanupBridgeURL != "" {
		transport, err := accountcleanup.NewHTTPTransport(cfg.CleanupBridgeURL, cfg.CleanupBridgeKey)
		if err != nil {
			logger.Error("cleanup worker configuration invalid", "err", err)
			os.Exit(1)
		}
		workerCtx, cancelWorker := context.WithCancel(ctx)
		workerDone := make(chan struct{})
		worker := accountcleanup.Worker{Store: store.CleanupQueue{DB: db}, Transport: transport}
		go func() {
			defer close(workerDone)
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				if err := worker.RunOnce(workerCtx); err != nil && workerCtx.Err() == nil {
					logger.Warn("account cleanup attempt failed", "err", err)
				}
				select {
				case <-workerCtx.Done():
					return
				case <-ticker.C:
				}
			}
		}()
		defer func() { cancelWorker(); <-workerDone }()
	}

	addr := net.JoinHostPort("", cfg.Port)
	httpSrv := srv.HTTPServer(addr)
	errCh := make(chan error, 1)
	go func() { errCh <- httpSrv.ListenAndServe() }()
	logger.Info("identity service listening", "addr", addr)

	select {
	case <-ctx.Done():
		logger.Info("shutting down")
		shCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shCtx)
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server failed", "err", err)
			os.Exit(1)
		}
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
