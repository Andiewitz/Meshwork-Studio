/**
 * Metrics module database access.
 * Uses the shared server-wide pool from server/lib/db.
 */
import { db, pool } from "../../lib/db";
import { createChildLogger } from "../../lib/logger";

const log = createChildLogger("metrics-db");

export { db, pool };

export async function createMetricsTable() {
  if (!process.env.DATABASE_URL) {
    log.warn("DATABASE_URL not set, metrics snapshots disabled");
    return;
  }

  try {
    await pool.query(`
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
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS IDX_metrics_snapshots_captured_at
      ON metrics_snapshots (captured_at DESC);
    `);
    log.info("Metrics snapshots table created/verified");

    // Migrations for existing tables (idempotent)
    const alters = [
      `ALTER TABLE metrics_snapshots ADD COLUMN IF NOT EXISTS total_users INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE metrics_snapshots ADD COLUMN IF NOT EXISTS new_users_today INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE metrics_snapshots ADD COLUMN IF NOT EXISTS active_users_24h INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE metrics_snapshots ADD COLUMN IF NOT EXISTS logins_today INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE metrics_snapshots ADD COLUMN IF NOT EXISTS total_workspaces INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE metrics_snapshots ADD COLUMN IF NOT EXISTS total_teams INTEGER NOT NULL DEFAULT 0`,
    ];
    for (const q of alters) await pool.query(q);
    log.info("Metrics migrations verified");
  } catch (err) {
    log.error({ err }, "Failed to create metrics_snapshots table");
  }
}
