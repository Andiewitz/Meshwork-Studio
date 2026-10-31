// Per-service embedded schema migrations.
//
// Each domain service owns `db/migrations/index.ts` exporting an ordered
// list of SQL versions. Applied here, transactionally, fail-closed: a bad
// migration aborts boot rather than serving against a half-migrated DB.
//
// Why TS instead of .sql files: the production artifact is a single bundled
// CJS file — imported modules ship automatically, loose files do not.

import type { Pool } from "pg";
import { createChildLogger } from "./logger";

const log = createChildLogger("migrate");

export interface Migration {
  version: string;
  up: string;
}

export async function ensureSchema(
  serviceName: string,
  pool: Pool,
  migrations: Migration[],
): Promise<void> {
  const client = await pool.connect();
  let locked = false;
  let discardClient = false;
  try {
    // One lock per database protects schema_migrations even if services share it.
    await client.query("SELECT pg_advisory_lock($1, $2)", [1296388936, 1]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version varchar(255) PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ version: string }>(
      `SELECT version FROM schema_migrations`,
    );
    const applied = new Set(rows.map((r) => r.version));

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;

      try {
        await client.query("BEGIN");
        await client.query(migration.up);
        await client.query(
          `INSERT INTO schema_migrations (version) VALUES ($1)`,
          [migration.version],
        );
        await client.query("COMMIT");
        log.info(`${serviceName}: applied ${migration.version}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(
          `${serviceName}: migration ${migration.version} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { cause: err },
        );
      }
    }
  } finally {
    if (locked) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock($1, $2)",
          [1296388936, 1],
        );
      } catch (error) {
        discardClient = true;
        log.error(
          { err: error, serviceName },
          "Failed to release migration lock",
        );
      }
    }
    client.release(discardClient);
  }
}
