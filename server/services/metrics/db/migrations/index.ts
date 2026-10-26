import type { Migration } from "@server/lib/migrate";

export const MIGRATIONS: Migration[] = [
  {
    version: "0001_snapshots",
    up: `
      CREATE TABLE IF NOT EXISTS metrics_snapshots (
        id SERIAL PRIMARY KEY,
        captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        total_requests REAL NOT NULL DEFAULT 0,
        request_rate REAL NOT NULL DEFAULT 0,
        avg_duration_ms REAL NOT NULL DEFAULT 0,
        memory_mb REAL NOT NULL DEFAULT 0,
        cpu_seconds REAL NOT NULL DEFAULT 0,
        event_loop_lag_ms REAL NOT NULL DEFAULT 0,
        ws_connections INTEGER NOT NULL DEFAULT 0,
        ws_rooms INTEGER NOT NULL DEFAULT 0,
        ai_requests REAL NOT NULL DEFAULT 0,
        total_users INTEGER NOT NULL DEFAULT 0,
        new_users_today INTEGER NOT NULL DEFAULT 0,
        active_users_24h INTEGER NOT NULL DEFAULT 0,
        logins_today INTEGER NOT NULL DEFAULT 0,
        total_workspaces INTEGER NOT NULL DEFAULT 0,
        total_teams INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS IDX_metrics_snapshots_captured_at
        ON metrics_snapshots (captured_at DESC);
    `,
  },
  {
    version: "0002_nullable_domain_counts",
    up: `
      ALTER TABLE metrics_snapshots
        ALTER COLUMN total_users DROP NOT NULL,
        ALTER COLUMN total_users DROP DEFAULT,
        ALTER COLUMN new_users_today DROP NOT NULL,
        ALTER COLUMN new_users_today DROP DEFAULT,
        ALTER COLUMN active_users_24h DROP NOT NULL,
        ALTER COLUMN active_users_24h DROP DEFAULT,
        ALTER COLUMN logins_today DROP NOT NULL,
        ALTER COLUMN logins_today DROP DEFAULT,
        ALTER COLUMN total_workspaces DROP NOT NULL,
        ALTER COLUMN total_workspaces DROP DEFAULT,
        ALTER COLUMN total_teams DROP NOT NULL,
        ALTER COLUMN total_teams DROP DEFAULT;
    `,
  },
];
