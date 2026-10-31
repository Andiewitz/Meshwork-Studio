import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Explicit system tier. Only use a disposable database, never a production DSN.
const connectionString = process.env.MIGRATION_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "MIGRATION_TEST_DATABASE_URL must name a disposable PostgreSQL database",
  );
const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const isolated = new Pool({
  connectionString,
  options: `-c search_path=${schema},public`,
  connectionTimeoutMillis: 3000,
});
let created = false;

describe("real PostgreSQL migration locking", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
  });
  afterAll(async () => {
    await isolated.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  it("runs a migration once when two processes start together", async () => {
    const args = [
      "node_modules/tsx/dist/cli.mjs",
      "tests/system/arch/fixtures/migration-worker.ts",
    ];
    const options = {
      env: {
        ...process.env,
        MIGRATION_TEST_DATABASE_URL: connectionString,
        MIGRATION_TEST_SCHEMA: schema,
      },
      timeout: 15000,
    };
    await Promise.all([
      promisify(execFile)(process.execPath, args, options),
      promisify(execFile)(process.execPath, args, options),
    ]);
    const sentinel = await isolated.query("SELECT id FROM migration_sentinel");
    const versions = await isolated.query(
      "SELECT version FROM schema_migrations WHERE version = $1",
      ["concurrent-test-v1"],
    );
    expect(sentinel.rows).toEqual([{ id: 1 }]);
    expect(versions.rows).toEqual([{ version: "concurrent-test-v1" }]);
  });
});
