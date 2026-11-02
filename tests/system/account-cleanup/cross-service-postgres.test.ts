import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MIGRATIONS as workspaceMigrations } from "@services/workspace/db/migrations";
import { MIGRATIONS as teamMigrations } from "@services/team/db/migrations";
import { MIGRATIONS as aiMigrations } from "@services/ai/db/migrations";
import { EventBus } from "@server/lib/events";
import { registerAccountCleanupInternalRoutes } from "@server/lib/account-cleanup-internal";

const connectionString = process.env.ACCOUNT_CLEANUP_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "ACCOUNT_CLEANUP_TEST_DATABASE_URL must name a disposable PostgreSQL database",
  );
const suffix = randomUUID().replaceAll("-", "");
const schemas = {
  auth: `cleanup_auth_${suffix}`,
  workspace: `cleanup_ws_${suffix}`,
  team: `cleanup_team_${suffix}`,
  ai: `cleanup_ai_${suffix}`,
};
const admin = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const pools = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [
    name,
    new Pool({
      connectionString,
      options: `-c search_path=${schema},public`,
      connectionTimeoutMillis: 3000,
    }),
  ]),
) as Record<keyof typeof schemas, Pool>;
const operationId = "bb58910d-3bf7-40cf-9cde-6f3992b09a91";
const authURL = new URL(connectionString);
authURL.searchParams.set("search_path", `${schemas.auth},public`);
const createdSchemas: string[] = [];
const priorKey = process.env.INTERNAL_API_KEY;
let server: Server | undefined;
let bridgeURL = "";
let stopWorkspace: (() => Promise<void>) | undefined;
let wakeWorkspace: (() => void) | undefined;
const canvasCleanup = vi.fn();

async function runGo(mode: "seed" | "run") {
  return promisify(execFile)(
    "go",
    ["run", "./internal/accountcleanup/testdata/runner"],
    {
      cwd: "server/services/auth",
      env: {
        ...process.env,
        AUTH_TEST_DATABASE_URL: authURL.toString(),
        CLEANUP_TEST_MODE: mode,
        CLEANUP_TEST_BRIDGE_URL: bridgeURL,
      },
      timeout: 60000,
    },
  );
}

describe("cross-service account cleanup", () => {
  beforeAll(async () => {
    for (const schema of Object.values(schemas)) {
      await admin.query(`CREATE SCHEMA ${schema}`);
      createdSchemas.push(schema);
    }
    for (const migration of workspaceMigrations)
      await pools.workspace.query(migration.up);
    for (const migration of teamMigrations)
      await pools.team.query(migration.up);
    for (const migration of aiMigrations) await pools.ai.query(migration.up);
    await runGo("seed");
    await pools.workspace.query(
      `INSERT INTO workspaces(id,title,user_id) VALUES ('canvas-user','User','user'),('canvas-other','Other','other')`,
    );
    await pools.workspace.query(
      `INSERT INTO workspace_collaborators(workspace_id,user_id,permission,added_by) VALUES ('canvas-other','user','view','other')`,
    );
    await pools.team.query(
      `INSERT INTO teams(id,name,owner_id,invite_code) VALUES ('team-user','User','user','MX-AAAA'),('team-other','Other','other','MX-BBBB')`,
    );
    await pools.team.query(
      `INSERT INTO team_members(id,team_id,user_id,color) VALUES ('membership','team-other','user','#FFFFFF')`,
    );
    await pools.ai.query(
      `INSERT INTO conversations(id,user_id) VALUES ('conversation-user','user'),('conversation-other','other')`,
    );
    await pools.ai.query(
      `INSERT INTO messages(id,conversation_id,role) VALUES ('message-user','conversation-user','user'),('message-other','conversation-other','user')`,
    );
    vi.doMock("@services/workspace/db/connection", () => ({
      db: drizzle(pools.workspace),
      pool: pools.workspace,
    }));
    vi.doMock("@services/team/db/connection", () => ({
      db: drizzle(pools.team),
      pool: pools.team,
    }));
    vi.doMock("@services/ai/db/connection", () => ({
      db: drizzle(pools.ai),
      pool: pools.ai,
    }));
    vi.doMock("@services/workspace/routes/workspaceRoutes", () => ({
      registerWorkspaceRoutes: vi.fn(),
    }));
    vi.doMock("@services/workspace/db/internal-routes", () => ({
      registerWorkspaceInternalRoutes: vi.fn(),
    }));
    vi.doMock("@services/team/routes/teamRoutes", () => ({
      registerTeamRoutes: vi.fn(),
    }));
    vi.doMock("@services/team/db/internal-routes", () => ({
      registerTeamInternalRoutes: vi.fn(),
    }));
    vi.doMock("@services/ai/routes/aiRoutes", () => ({
      createAIRoutes: () => express.Router(),
    }));
    const [{ WorkspaceService }, { TeamService }, { AIService }] =
      await Promise.all([
        import("@services/workspace"),
        import("@services/team"),
        import("@services/ai"),
      ]);
    stopWorkspace = () => WorkspaceService.shutdown();
    wakeWorkspace = (await import("@services/workspace/outbox-service"))
      .workspaceOutbox.wake;
    const bus = new EventBus();
    canvasCleanup.mockImplementationOnce(async () => {
      throw new Error("simulated Canvas failure");
    });
    canvasCleanup.mockImplementation(async (_payload, { operationId }) => ({
      operationId,
      status: "completed",
    }));
    bus.registerRequired("workspaces.deleted", canvasCleanup);
    const app = express();
    app.use(express.json());
    const context = {
      eventBus: bus,
      isAuthenticated: vi.fn(),
      directAccess: {} as never,
      workspaces: {} as never,
    };
    WorkspaceService.initialize(app, context);
    TeamService.initialize(app, context);
    AIService.initialize(app, context);
    process.env.INTERNAL_API_KEY = "test-node-key";
    registerAccountCleanupInternalRoutes(
      app,
      bus,
      async ({ operationId, userId, claimToken, service }) => {
        const { rows } = await pools.auth.query(
          `SELECT EXISTS(SELECT 1 FROM account_cleanup_operations o JOIN account_cleanup_steps s ON s.operation_id=o.id JOIN users u ON u.id=o.user_id WHERE o.id=$1 AND o.user_id=$2 AND o.claim_token=$3 AND o.status='pending' AND o.locked_until>clock_timestamp() AND u.is_active=false AND s.service=$4) AS authorized`,
          [operationId, userId, claimToken, service],
        );
        return { authorized: rows[0].authorized };
      },
    );
    server = createServer(app);
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    bridgeURL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 120000);
  afterAll(async () => {
    await stopWorkspace?.();
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    for (const pool of Object.values(pools)) await pool.end();
    for (const schema of createdSchemas.reverse())
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    if (priorKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = priorKey;
    for (const name of [
      "@services/workspace/db/connection",
      "@services/team/db/connection",
      "@services/ai/db/connection",
      "@services/workspace/routes/workspaceRoutes",
      "@services/workspace/db/internal-routes",
      "@services/team/routes/teamRoutes",
      "@services/team/db/internal-routes",
      "@services/ai/routes/aiRoutes",
    ])
      vi.doUnmock(name);
  });
  it("retries queued Canvas work and finishes all owners without touching another user", async () => {
    const waitForOutbox = async (
      condition: (row: {
        last_error: string | null;
        processed_at: Date | null;
      }) => boolean,
    ) => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const row = (
          await pools.workspace.query(
            "SELECT last_error,processed_at FROM workspace_outbox_events WHERE id=$1",
            [operationId],
          )
        ).rows[0];
        if (row && condition(row)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Workspace outbox did not reach the expected state");
    };
    await runGo("run");
    await waitForOutbox((row) => row.last_error !== null);
    const pending = await pools.auth.query(
      "SELECT status FROM account_cleanup_operations WHERE id=$1",
      [operationId],
    );
    expect(pending.rows[0].status).toBe("pending");
    expect(
      (await pools.auth.query("SELECT id FROM users WHERE id='user'")).rows,
    ).toEqual([{ id: "user" }]);
    await pools.workspace.query(
      "UPDATE workspace_outbox_events SET available_at=now() WHERE id=$1",
      [operationId],
    );
    wakeWorkspace?.();
    await waitForOutbox((row) => row.processed_at !== null);
    await pools.auth.query(
      "UPDATE account_cleanup_operations SET next_attempt_at=now() WHERE id=$1",
      [operationId],
    );
    await runGo("run");
    const finished = await pools.auth.query(
      "SELECT status FROM account_cleanup_operations WHERE id=$1",
      [operationId],
    );
    expect(finished.rows[0].status).toBe("completed");
    expect(
      (await pools.auth.query("SELECT id FROM users WHERE id='user'")).rows,
    ).toEqual([]);
    expect(
      (await pools.workspace.query("SELECT id FROM workspaces ORDER BY id"))
        .rows,
    ).toEqual([{ id: "canvas-other" }]);
    expect(
      (
        await pools.workspace.query(
          "SELECT user_id FROM workspace_collaborators",
        )
      ).rows,
    ).toEqual([]);
    expect((await pools.team.query("SELECT id FROM teams")).rows).toEqual([
      { id: "team-other" },
    ]);
    expect(
      (await pools.team.query("SELECT id FROM team_members")).rows,
    ).toEqual([]);
    expect((await pools.ai.query("SELECT id FROM conversations")).rows).toEqual(
      [{ id: "conversation-other" }],
    );
    expect((await pools.ai.query("SELECT id FROM messages")).rows).toEqual([
      { id: "message-other" },
    ]);
    expect(canvasCleanup).toHaveBeenCalledTimes(2);
    expect(canvasCleanup).toHaveBeenCalledWith(
      { ids: ["canvas-user"] },
      { operationId },
    );
  }, 120000);
});
