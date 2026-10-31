import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MIGRATIONS } from "@services/ai/db/migrations";

const connectionString = process.env.AI_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "AI_TEST_DATABASE_URL must name a disposable PostgreSQL database",
  );
const schema = `ai_cleanup_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema},public`,
  connectionTimeoutMillis: 3000,
});
let created = false;
let cleanup: (id: string) => Promise<void>;

describe("AI account cleanup with PostgreSQL", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    for (const migration of MIGRATIONS) await pool.query(migration.up);
    vi.doMock("@services/ai/db/connection", () => ({
      db: drizzle(pool),
      pool,
    }));
    cleanup = (await import("@services/ai/db/storage")).deleteAllUserAiData;
  });
  afterAll(async () => {
    vi.doUnmock("@services/ai/db/connection");
    await pool.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  it("deletes the user's keys, conversations, messages and memories without affecting another user", async () => {
    await pool.query(
      `INSERT INTO user_api_keys(id,user_id,provider,encrypted_key,iv,auth_tag) VALUES ('k1','user','openai','x','x','x'),('k2','other','openai','x','x','x')`,
    );
    await pool.query(
      `INSERT INTO conversations(id,user_id) VALUES ('c1','user'),('c2','other')`,
    );
    await pool.query(
      `INSERT INTO messages(id,conversation_id,role) VALUES ('m1','c1','user'),('m2','c2','user')`,
    );
    await pool.query(
      `INSERT INTO memories(id,user_id,key,content) VALUES ('a1','user','x','x'),('a2','other','x','x')`,
    );
    await cleanup("user");
    await cleanup("user");
    for (const [table, id] of [
      ["user_api_keys", "k2"],
      ["conversations", "c2"],
      ["messages", "m2"],
      ["memories", "a2"],
    ]) {
      expect(
        (await pool.query(`SELECT id FROM ${table} ORDER BY id`)).rows,
      ).toEqual([{ id }]);
    }
  });
});
