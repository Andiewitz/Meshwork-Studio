import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Authorization matrix: proves the post-refactor route guards behave exactly
 * as before for every role — i.e. users NEVER get a 403 on their own data,
 * strangers never get in, viewers can read but not write.
 */

// ─── shared mock fabric ─────────────────────────────────────────────────────

const OWNER = "owner-1";
const EDITOR = "editor-1";
const VIEWER = "viewer-1";
const STRANGER = "stranger-1";
const WS_ID = "ws-1";

function makeRoleMock(
  roleByUser: Record<string, string | null>,
  ownerOfWs: string,
) {
  return {
    // Signatures per teamStorage interface:
    //   getWorkspaceRole(workspaceId, userId)
    //   canAccessWorkspace(userId, workspaceId)
    getWorkspaceRole: vi.fn(async (_wsId: string, userId: string) => {
      if (userId === ownerOfWs) return "workspace-owner";
      return roleByUser[userId] ?? null;
    }),
    canAccessWorkspace: vi.fn(async (userId: string, _wsId: string) => {
      if (userId === ownerOfWs) return true;
      return Boolean(roleByUser[userId]);
    }),
  };
}

vi.mock("@services/team/db/storage", () => ({
  teamStorage: {},
  TeamDatabaseStorage: vi.fn(),
}));

// ─── workspace service ──────────────────────────────────────────────────────

const wsRows: Record<string, { id: string; title: string; userId: string }> =
  {};
const updateCalls: string[] = [];

vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: {
    getWorkspace: vi.fn(async (id: string) => wsRows[id] ?? null),
    updateWorkspace: vi.fn(
      async (_id: string, data: Record<string, unknown>) => {
        updateCalls.push(JSON.stringify(data));
        return { id: _id, ...data };
      },
    ),
    getWorkspacesByUserId: vi.fn(async () => Object.values(wsRows)),
    createWorkspace: vi.fn(async (data: Record<string, unknown>) => ({
      id: "new-ws",
      ...data,
    })),
    deleteWorkspace: vi.fn(async () => undefined),
    duplicateWorkspace: vi.fn(async () => ({ id: "dup" })),
  },
  WorkspaceDatabaseStorage: vi.fn(),
}));

// ─── canvas service ────────────────────────────────────────────────────────

const canvasState: Record<string, { nodes: unknown[]; edges: unknown[] }> = {};

vi.mock("@services/canvas/db/storage", () => ({
  canvasStorage: {
    getNodes: vi.fn(async () => []),
    getEdges: vi.fn(async () => []),
    getCanvasRevision: vi.fn(async () => 0),
    syncCanvas: vi.fn(
      async (id: string, nodes: unknown[], edges: unknown[]) => {
        canvasState[id] = { nodes, edges };
      },
    ),
  },
  CanvasDatabaseStorage: vi.fn(),
}));

// ─── auth stub keyed by x-test-user-id ─────────────────────────────────────

vi.mock("../../../server/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../server/auth")>(
    "../../../server/auth",
  );
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: any) => {
      const id = req.headers["x-test-user-id"];
      if (!id)
        return res
          .status(401)
          .json({ code: "UNAUTHENTICATED", message: "no user" });
      req.user = { id };
      req.auth = { userId: id, sessionId: "test", user: { id } };
      next();
    },
    optionalAuth: (req: any, _res: any, next: any) => {
      const id = req.headers["x-test-user-id"];
      if (id) req.user = { id };
      next();
    },
    csrfProtect: (_req: any, _res: any, next: any) => next(),
  };
});

vi.mock("@server/middleware/rateLimit", () => ({
  apiLimiter: (_r: any, _s: any, n: any) => n(),
  authLimiter: (_r: any, _s: any, n: any) => n(),
}));

// ─── build one app with both services mounted ──────────────────────────────

async function buildApp(roles: Record<string, string | null>) {
  const teamMock = makeRoleMock(roles, OWNER);
  const [
    { registerWorkspaceRoutes },
    { registerCanvasRoutes },
    wsMod,
    canvasMod,
  ] = await Promise.all([
    import("@services/workspace/routes"),
    import("@services/canvas/routes/canvasRoutes"),
    import("@services/workspace/db/storage"),
    import("@services/canvas/db/storage"),
  ]);

  const app = express();
  app.use(express.json());
  const registryGet = (key: string) => {
    if (key === "isAuthenticated")
      return (req: any, res: any, next: any) => {
        const id = req.headers["x-test-user-id"];
        if (!id)
          return res
            .status(401)
            .json({ code: "UNAUTHENTICATED", message: "no user" });
        req.user = { id };
        req.auth = { userId: id, sessionId: "test", user: { id } };
        next();
      };
    if (key === "teamStorage") return teamMock;
    if (key === "workspaceStorage") return wsMod.workspaceStorage;
    if (key === "canvasStorage") return canvasMod.canvasStorage;
    return null;
  };
  const context = {
    registry: { get: registryGet },
    eventBus: {
      emit: vi.fn() as unknown as (...a: unknown[]) => void,
      emitAsync: vi.fn() as unknown as (...a: unknown[]) => Promise<void>,
    },
  } as unknown as any;

  registerWorkspaceRoutes(app, context);
  registerCanvasRoutes(app, context);
  return app;
}

describe("authorization matrix — no 403 on your own data", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    // Seed: WS_ID owned by OWNER, shared with editor+viewer.
    wsRows[WS_ID] = { id: WS_ID, title: "Shared", userId: OWNER };
    updateCalls.length = 0;
    delete canvasState[WS_ID];
  });

  it("owner_reads_own_workspace → 200", async () => {
    app = await buildApp({
      EDITOR: "editor",
      VIEWER: "viewer",
      STRANGER: null,
    });
    const res = await request(app)
      .get(`/api/v1/workspaces/${WS_ID}`)
      .set("x-test-user-id", OWNER);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(WS_ID);
  });

  it("stranger_gets_403_not_500_on_foreign_workspace_read", async () => {
    app = await buildApp({ VIEWER: "viewer" });
    const res = await request(app)
      .get(`/api/v1/workspaces/${WS_ID}`)
      .set("x-test-user-id", STRANGER);
    expect([403, 404]).toContain(res.status); // never 200, never 500
  });

  it("owner_updates_own_workspace → 200 and write lands", async () => {
    app = await buildApp({});
    const res = await request(app)
      .put(`/api/v1/workspaces/${WS_ID}`)
      .set("x-test-user-id", OWNER)
      .send({ title: "renamed" });
    expect(res.status).toBe(200);
    expect(updateCalls.length).toBe(1);
  });

  it("viewer_can_read_but_cannot_write_shared_workspace", async () => {
    app = await buildApp({ [EDITOR]: "editor", [VIEWER]: "viewer" });

    const read = await request(app)
      .get(`/api/v1/workspaces/${WS_ID}`)
      .set("x-test-user-id", VIEWER);
    expect(read.status).toBe(200);

    const write = await request(app)
      .put(`/api/v1/workspaces/${WS_ID}`)
      .set("x-test-user-id", VIEWER)
      .send({ title: "viewer-edit" });
    expect(write.status).toBe(403);
    expect(updateCalls.length).toBe(0);
  });

  it("canvas: viewer_reads_ok_and_is_blocked_from_syncing; editor_syncs_fine", async () => {
    app = await buildApp({ [EDITOR]: "editor", [VIEWER]: "viewer" });

    const read = await request(app)
      .get(`/api/v1/workspaces/${WS_ID}/canvas`)
      .set("x-test-user-id", VIEWER);
    expect(read.status).toBe(200);

    const viewerSync = await request(app)
      .post(`/api/v1/workspaces/${WS_ID}/canvas`)
      .set("x-test-user-id", VIEWER)
      .send({ nodes: [], edges: [], baseRevision: 0 });
    expect(viewerSync.status).toBe(403);
    expect(canvasState[WS_ID]).toBeUndefined();

    const editorSync = await request(app)
      .post(`/api/v1/workspaces/${WS_ID}/canvas`)
      .set("x-test-user-id", EDITOR)
      .send({ nodes: [{ id: "n1" }], edges: [], baseRevision: 0 });
    expect(editorSync.status).toBe(200);
    expect(canvasState[WS_ID]?.nodes).toHaveLength(1);
  });

  it("unauthenticated_requests_are_401_across_the_board", async () => {
    app = await buildApp({});
    const read = await request(app).get(`/api/v1/workspaces/${WS_ID}`);
    const write = await request(app)
      .post(`/api/v1/workspaces/${WS_ID}/canvas`)
      .send({ nodes: [], edges: [], baseRevision: 0 });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });
});
