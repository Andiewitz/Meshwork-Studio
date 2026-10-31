import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MIGRATIONS } from "@services/team/db/migrations";
import type { TeamDatabaseStorage } from "@services/team/db/storage";

const connectionString = process.env.TEAM_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "TEAM_TEST_DATABASE_URL must name a disposable PostgreSQL database",
  );
const schema = `team_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema},public`,
  connectionTimeoutMillis: 3000,
});
const invalidate = vi.fn().mockResolvedValue(undefined);
let created = false;
let storage: TeamDatabaseStorage;

describe("team account cleanup with PostgreSQL", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    for (const migration of MIGRATIONS) await pool.query(migration.up);
    vi.doMock("@services/team/db/connection", () => ({
      db: drizzle(pool),
      pool,
    }));
    vi.doMock("@services/team/db/access-cache", () => ({
      invalidateWorkspaceAccess: invalidate,
      readCachedWorkspaceRole: vi.fn(),
      cacheWorkspaceRole: vi.fn(),
    }));
    const module = await import("@services/team/db/storage");
    storage = new module.TeamDatabaseStorage();
  });
  afterAll(async () => {
    vi.doUnmock("@services/team/db/connection");
    vi.doUnmock("@services/team/db/access-cache");
    await pool.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  it("deletes owned teams and memberships in other teams; replay is safe", async () => {
    await pool.query(
      `INSERT INTO teams(id,name,owner_id) VALUES ('owned','Owned','user'),('other','Other','owner')`,
    );
    await pool.query(
      `INSERT INTO team_members(id,team_id,user_id,color) VALUES ('m1','owned','member','#FFFFFF'),('m2','other','user','#FFFFFF'),('m3','other','member','#FFFFFF')`,
    );
    await pool.query(
      `INSERT INTO team_workspaces(id,team_id,workspace_id) VALUES ('w1','owned','canvas-a'),('w2','other','canvas-b')`,
    );
    await storage.deleteAllUserData("user");
    expect((await pool.query("SELECT id FROM teams ORDER BY id")).rows).toEqual(
      [{ id: "other" }],
    );
    expect(
      (await pool.query("SELECT id FROM team_members ORDER BY id")).rows,
    ).toEqual([{ id: "m3" }]);
    expect(invalidate).toHaveBeenCalledWith(
      expect.arrayContaining(["canvas-a", "canvas-b"]),
      expect.arrayContaining(["user", "member"]),
    );
    await storage.deleteAllUserData("user");
    expect((await pool.query("SELECT id FROM team_members")).rows).toEqual([
      { id: "m3" },
    ]);
  });
});
