import { Pool } from "pg";
import { ensureSchema } from "../../../../server/lib/migrate";

const pool = new Pool({
  connectionString: process.env.MIGRATION_TEST_DATABASE_URL,
  options: `-c search_path=${process.env.MIGRATION_TEST_SCHEMA},public`,
  connectionTimeoutMillis: 3000,
});
try {
  await ensureSchema("concurrency-test", pool, [
    {
      version: "concurrent-test-v1",
      up: "SELECT pg_sleep(0.25); CREATE TABLE migration_sentinel (id int PRIMARY KEY); INSERT INTO migration_sentinel VALUES (1)",
    },
  ]);
} finally {
  await pool.end();
}
