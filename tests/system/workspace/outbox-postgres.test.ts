import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PostgresWorkspaceOutboxStore } from "@services/workspace/outbox-store";
import { MIGRATIONS } from "@services/workspace/db/migrations";
import type { WorkspaceDatabaseStorage } from "@services/workspace/db/storage";

// Explicit system tier, isolated schema; never run against a production DSN.
const schema = `outbox_test_${randomUUID().replaceAll("-", "")}`;
const connectionString = process.env.OUTBOX_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "OUTBOX_TEST_DATABASE_URL must name a disposable PostgreSQL database",
  );
const admin = new Pool({ connectionString, connectionTimeoutMillis: 3_000 });
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema},public`,
  connectionTimeoutMillis: 3_000,
});
const store = new PostgresWorkspaceOutboxStore(pool);
let storage: WorkspaceDatabaseStorage;

async function seed(
  attempts = 0,
  type = "workspace.deleted",
  payload: object = { id: "deleted" },
) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO workspace_outbox_events (event_type, payload, attempts) VALUES ($1, $2, $3) RETURNING id`,
    [type, payload, attempts],
  );
  return rows[0].id;
}
async function copy(attempts = 0) {
  await pool.query(
    "INSERT INTO workspaces(id,title,canvas_copy_status) VALUES ('dest','Copy','copying')",
  );
  return seed(attempts, "workspace.duplicated", {
    originalId: "src",
    newId: "dest",
  });
}
async function state() {
  return {
    events: (
      await pool.query(
        "SELECT * FROM workspace_outbox_events ORDER BY created_at, id",
      )
    ).rows,
    copies: (await pool.query("SELECT * FROM workspaces WHERE id = 'dest'"))
      .rows,
  };
}
async function expire() {
  await pool.query(
    "UPDATE workspace_outbox_events SET locked_until = NOW() - INTERVAL '1 second'",
  );
}

describe("workspace outbox PostgreSQL ownership", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const migration of MIGRATIONS) await pool.query(migration.up);
    vi.doMock("@services/workspace/db/connection", () => ({
      db: drizzle(pool),
      pool,
    }));
    const module = await import("@services/workspace/db/storage");
    storage = new module.WorkspaceDatabaseStorage();
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE workspace_outbox_events, workspaces, collections CASCADE",
    );
  });
  afterAll(async () => {
    vi.doUnmock("@services/workspace/db/connection");
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  it("migrates existing pending rows without losing their operation id", async () => {
    const id = await seed();
    await pool.query(
      "ALTER TABLE workspace_outbox_events DROP COLUMN claim_token, DROP COLUMN published_at",
    );
    await pool.query(
      MIGRATIONS.find((m) => m.version === "0023_outbox_claim_fencing")!.up,
    );
    expect(await store.claim()).toMatchObject({
      id,
      attempts: 1,
      claimToken: expect.any(String),
    });
  });

  it("two concurrent workers claim different jobs; an active claim cannot be stolen", async () => {
    await seed();
    await seed();
    const [a, b] = await Promise.all([
      store.claim(),
      new PostgresWorkspaceOutboxStore(pool).claim(),
    ]);
    expect(a?.id).not.toBe(b?.id);
    expect(a?.claimToken).not.toBe(b?.claimToken);
    expect(await store.claim()).toBeUndefined();
  });

  it("rejects renewal, success and failure after expiry even before reclaim", async () => {
    await copy();
    const claim = (await store.claim())!;
    await expire();
    expect(await store.renew(claim)).toBe(false);
    expect(
      await store.settle(claim, { operationId: claim.id, status: "completed" }),
    ).toBe(false);
    expect(await store.fail(claim, new Error("late"))).toBe(false);
    const snapshot = await state();
    expect(snapshot.events[0]).toMatchObject({
      processed_at: null,
      last_error: null,
    });
    expect(snapshot.copies[0].canvas_copy_status).toBe("copying");
  });

  it("reclaims with a new token and fences old completion/failure including copy status", async () => {
    await copy();
    const old = (await store.claim())!;
    await expire();
    const fresh = (await new PostgresWorkspaceOutboxStore(pool).claim())!;
    expect(fresh).toMatchObject({ id: old.id, attempts: 2 });
    expect(fresh.claimToken).not.toBe(old.claimToken);
    expect(
      await store.settle(old, { operationId: old.id, status: "completed" }),
    ).toBe(false);
    expect(
      await store.fail({ ...old, attempts: 12 }, new Error("stale failure")),
    ).toBe(false);
    expect((await state()).copies[0].canvas_copy_status).toBe("copying");
    expect(
      await store.settle(fresh, { operationId: fresh.id, status: "completed" }),
    ).toBe(true);
    expect(await store.fail(old, new Error("even later"))).toBe(false);
    expect((await state()).copies[0].canvas_copy_status).toBe("ready");
  });

  it("renews owned work and separates publication from completion", async () => {
    await copy();
    const claim = (await store.claim())!;
    expect(await store.renew(claim)).toBe(true);
    expect(
      await store.settle(claim, { operationId: claim.id, status: "published" }),
    ).toBe(true);
    let snapshot = await state();
    expect(snapshot.events[0].published_at).toBeInstanceOf(Date);
    expect(snapshot.events[0].processed_at).toBeNull();
    expect(snapshot.copies[0].canvas_copy_status).toBe("copying");
    await pool.query("UPDATE workspace_outbox_events SET available_at = NOW()");
    const next = (await store.claim())!;
    await store.settle(next, { operationId: next.id, status: "completed" });
    snapshot = await state();
    expect(snapshot.events[0].processed_at).toBeInstanceOf(Date);
    expect(snapshot.copies[0].canvas_copy_status).toBe("ready");
    expect(
      await store.settle(next, { operationId: next.id, status: "completed" }),
    ).toBe(false);
  });

  it("backs off failures then dead-letters; replay preserves operation id and atomically retries copy", async () => {
    const id = await copy(10);
    let claim = (await store.claim())!;
    await store.fail(claim, new Error("x".repeat(2000)));
    let snapshot = await state();
    expect(snapshot.events[0].last_error).toHaveLength(1000);
    expect(snapshot.events[0].available_at.getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(await store.claim()).toBeUndefined();
    await pool.query("UPDATE workspace_outbox_events SET available_at = NOW()");
    claim = (await store.claim())!;
    await store.fail(claim, new Error("final failure"));
    expect((await state()).copies[0].canvas_copy_status).toBe("failed");
    expect(await store.claim()).toBeUndefined();
    expect(await store.replayDeadLetter(id)).toBe(true);
    expect(await store.replayDeadLetter(id)).toBe(false);
    snapshot = await state();
    expect(snapshot.copies[0].canvas_copy_status).toBe("copying");
    expect(snapshot.events[0]).toMatchObject({
      id,
      attempts: 0,
      processed_at: null,
      dead_lettered_at: null,
      claim_token: null,
    });
    expect(await store.claim()).toMatchObject({ id, attempts: 1 });
    expect(await store.fail(claim, new Error("pre-replay worker"))).toBe(false);
  });

  it("refuses dead-letter copy replay while another copy is active or destination is ready", async () => {
    const id = await copy(11);
    const claim = (await store.claim())!;
    await store.fail(claim, new Error("failed"));
    await seed(0, "workspace.duplicated", { originalId: "src", newId: "dest" });
    expect(await store.replayDeadLetter(id)).toBe(false);
    await pool.query("DELETE FROM workspace_outbox_events WHERE id <> $1", [
      id,
    ]);
    await pool.query(
      "UPDATE workspaces SET canvas_copy_status = 'ready' WHERE id = 'dest'",
    );
    expect(await store.replayDeadLetter(id)).toBe(false);
  });

  it("rejects a mismatched completion without mutating SQL", async () => {
    await seed();
    const claim = (await store.claim())!;
    await expect(
      store.settle(claim, { operationId: randomUUID(), status: "completed" }),
    ).rejects.toThrow("receipt");
    expect((await state()).events[0].processed_at).toBeNull();
  });

  it("reports backlog age, completion wait age and dead letters without counting completed jobs", async () => {
    await seed();
    await seed();
    await seed();
    const { rows } = await pool.query(
      "SELECT id FROM workspace_outbox_events ORDER BY id",
    );
    await pool.query(
      "UPDATE workspace_outbox_events SET created_at = NOW() - INTERVAL '5 minutes', published_at = NOW() - INTERVAL '2 minutes' WHERE id = $1",
      [rows[0].id],
    );
    await pool.query(
      "UPDATE workspace_outbox_events SET dead_lettered_at = NOW() WHERE id = $1",
      [rows[1].id],
    );
    await pool.query(
      "UPDATE workspace_outbox_events SET processed_at = NOW() WHERE id = $1",
      [rows[2].id],
    );
    const health = await store.inspect();
    expect(health).toMatchObject({ pendingCount: 1, deadLetterCount: 1 });
    expect(health.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(300);
    expect(health.oldestPublishedAgeSeconds).toBeGreaterThanOrEqual(120);
  });

  it("rolls back a deletion if its outbox insert fails", async () => {
    await pool.query(
      "INSERT INTO workspaces(id,title) VALUES ('original','Original')",
    );
    await pool.query(
      "ALTER TABLE workspace_outbox_events ADD CONSTRAINT reject_outbox CHECK (false) NOT VALID",
    );
    try {
      await expect(
        storage.deleteWorkspaceAndEnqueueCleanup("original"),
      ).rejects.toThrow();
      expect(
        (await pool.query("SELECT id FROM workspaces WHERE id = 'original'"))
          .rowCount,
      ).toBe(1);
      expect((await state()).events).toHaveLength(0);
    } finally {
      await pool.query(
        "ALTER TABLE workspace_outbox_events DROP CONSTRAINT reject_outbox",
      );
    }
  });

  it("rolls back duplicate and retry metadata if either command insert fails", async () => {
    await pool.query(
      "INSERT INTO workspaces(id,title) VALUES ('src','Original')",
    );
    await pool.query(
      "INSERT INTO workspaces(id,title,canvas_copy_status,canvas_copy_source_id) VALUES ('dest','Copy','failed','src')",
    );
    await pool.query(
      "ALTER TABLE workspace_outbox_events ADD CONSTRAINT reject_outbox CHECK (false) NOT VALID",
    );
    try {
      await expect(
        storage.duplicateWorkspaceAndEnqueueCanvasCopy("src", "Copy"),
      ).rejects.toThrow();
      expect((await pool.query("SELECT id FROM workspaces")).rowCount).toBe(2);
      await expect(storage.retryCanvasCopy("dest")).rejects.toThrow();
      expect((await state()).copies[0].canvas_copy_status).toBe("failed");
      expect((await state()).events).toHaveLength(0);
    } finally {
      await pool.query(
        "ALTER TABLE workspace_outbox_events DROP CONSTRAINT reject_outbox",
      );
    }
  });

  it("rolls back bulk account cleanup if its command insert fails", async () => {
    await pool.query(
      "INSERT INTO collections(title,user_id) VALUES ('Folder','owner')",
    );
    await pool.query(
      "INSERT INTO workspaces(id,title,user_id) VALUES ('src','Original','owner')",
    );
    await pool.query(
      "ALTER TABLE workspace_outbox_events ADD CONSTRAINT reject_outbox CHECK (false) NOT VALID",
    );
    try {
      await expect(
        storage.deleteAllUserDataAndEnqueueCleanup("owner"),
      ).rejects.toThrow();
      expect((await pool.query("SELECT id FROM workspaces")).rowCount).toBe(1);
      expect((await pool.query("SELECT id FROM collections")).rowCount).toBe(1);
      expect((await state()).events).toHaveLength(0);
    } finally {
      await pool.query(
        "ALTER TABLE workspace_outbox_events DROP CONSTRAINT reject_outbox",
      );
    }
  });

  it("deduplicates concurrent account cleanup retries with a stable operation ID", async () => {
    const operationId = randomUUID();
    await pool.query(
      "INSERT INTO workspaces(id,title,user_id) VALUES ('src','Source','owner')",
    );
    const [first, retry] = await Promise.all([
      storage.deleteAllUserDataAndEnqueueCleanup("owner", operationId),
      storage.deleteAllUserDataAndEnqueueCleanup("owner", operationId),
    ]);
    expect(first).toEqual(["src"]);
    expect(retry).toEqual(first);
    expect(await storage.getUserCleanupStatus("owner", operationId)).toBe(
      "pending",
    );
    expect(await storage.getUserCleanupStatus("other", operationId)).toBe(
      "not_found",
    );
    const events = (await state()).events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: operationId,
      payload: { ids: ["src"], userId: "owner" },
    });
    await expect(
      storage.deleteAllUserDataAndEnqueueCleanup("different-user", operationId),
    ).rejects.toThrow("already in use");
    const claim = (await store.claim())!;
    expect(
      await store.settle(claim, { operationId, status: "published" }),
    ).toBe(true);
    expect(await storage.getUserCleanupStatus("owner", operationId)).toBe(
      "pending",
    );
    await pool.query(
      "UPDATE workspace_outbox_events SET available_at = NOW() WHERE id = $1",
      [operationId],
    );
    const secondClaim = (await store.claim())!;
    expect(
      await store.settle(secondClaim, { operationId, status: "completed" }),
    ).toBe(true);
    expect(await storage.getUserCleanupStatus("owner", operationId)).toBe(
      "completed",
    );
  });

  it("runs the operator helper and refuses a second replay", async () => {
    const id = await seed(11);
    await store.fail((await store.claim())!, new Error("final"));
    const isolatedUrl = new URL(connectionString);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema},public`);
    const options = {
      env: { ...process.env, WORKSPACE_DATABASE_URL: isolatedUrl.toString() },
      timeout: 10_000,
    };
    const args = [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/replay-workspace-outbox.ts",
      id,
      "--workers-stopped",
    ];
    const result = await promisify(execFile)(process.execPath, args, options);
    expect(result.stdout).toContain(`Outbox operation ${id} queued for replay`);
    await expect(
      promisify(execFile)(process.execPath, args, options),
    ).rejects.toMatchObject({ code: 1 });
    expect((await state()).events[0]).toMatchObject({
      id,
      attempts: 0,
      dead_lettered_at: null,
    });
  });

  it("commits metadata and its command together for delete, duplicate, retry and bulk cleanup", async () => {
    await pool.query(
      "INSERT INTO workspaces(id,title,user_id) VALUES ('src','Source','owner')",
    );
    const destination = await storage.duplicateWorkspaceAndEnqueueCanvasCopy(
      "src",
      "Copy",
    );
    let snapshot = await state();
    expect(destination.canvasCopyStatus).toBe("copying");
    expect(snapshot.events[0].payload).toEqual({
      originalId: "src",
      newId: destination.id,
    });
    const claim = (await store.claim())!;
    await store.fail({ ...claim, attempts: 12 }, new Error("final"));
    await storage.retryCanvasCopy(destination.id);
    expect((await state()).events).toHaveLength(2);
    await storage.deleteWorkspaceAndEnqueueCleanup(destination.id);
    expect((await state()).events).toHaveLength(3);
    await storage.deleteAllUserDataAndEnqueueCleanup("owner");
    snapshot = await state();
    expect(snapshot.events).toHaveLength(4);
    expect((await pool.query("SELECT * FROM workspaces")).rowCount).toBe(0);
  });
});
