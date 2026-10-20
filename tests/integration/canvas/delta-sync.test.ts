import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { requestIdMiddleware } from "@server/middleware/requestId";
import {
  CanvasInvalidGraphError,
  CanvasRevisionConflictError,
} from "@services/canvas/db/dynamo";

const storage = vi.hoisted(() => ({
  syncCanvas: vi.fn(),
  syncCanvasChanges: vi.fn(),
}));

const cache = vi.hoisted(() => ({
  write: vi.fn(),
}));

vi.mock("@services/canvas/db/storage", () => ({ canvasStorage: storage }));

vi.mock("@services/canvas/cache", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@services/canvas/cache")>();
  return {
    ...actual,
    cacheCanvas: cache.write,
    readCachedCanvas: vi.fn(async () => null),
    invalidateCanvas: vi.fn(async () => undefined),
  };
});

vi.mock("../../../server/auth", async () => {
  const actual = await vi.importActual<typeof import("../../../server/auth")>(
    "../../../server/auth",
  );
  return {
    ...actual,
    csrfProtect: (_req: any, _res: any, next: any) => next(),
  };
});

const workspaceStorage = {
  getWorkspace: vi.fn(async (id: string) => ({
    id,
    userId: "user-1",
    canvasCopyStatus: "ok",
  })),
};
const teamStorage = {
  getWorkspaceRole: vi.fn(async () => "owner"),
};

const node = (id: string, data: Record<string, unknown> = {}) => ({
  id,
  type: "service",
  position: { x: 0, y: 0 },
  data: { label: id, ...data },
});
const edge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
});

async function buildApp() {
  const { registerCanvasRoutes } =
    await import("@services/canvas/routes/canvasRoutes");
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "5mb" }));
  const context = {
    registry: {
      get: (key: string) => {
        if (key === "isAuthenticated")
          return (req: any, _res: any, next: any) => {
            req.user = { id: "user-1" };
            next();
          };
        if (key === "workspaceStorage") return workspaceStorage;
        if (key === "teamStorage") return teamStorage;
        return null;
      },
    },
    eventBus: { emit: vi.fn(), emitAsync: vi.fn() },
  } as any;
  registerCanvasRoutes(app, context);
  return app;
}

describe("POST /canvas delta saves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.write.mockResolvedValue(undefined);
    storage.syncCanvas.mockResolvedValue(8);
    storage.syncCanvasChanges.mockResolvedValue({
      nodes: [node("a"), node("b", { label: "updated" })],
      edges: [edge("e1", "a", "b"), edge("e3", "b", "a")],
      revision: 8,
    });
  });

  it("merges a delta into a full snapshot and keeps the CAS revision", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/ws/canvas")
      .send({
        changes: {
          upsertNodes: [node("b", { label: "updated" })],
          upsertEdges: [edge("e3", "b", "a")],
          deleteNodeIds: ["c"],
          deleteEdgeIds: ["e2"],
        },
        baseRevision: 7,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, revision: 8 });
    expect(storage.syncCanvasChanges).toHaveBeenCalledWith(
      "ws",
      {
        upsertNodes: [node("b", { label: "updated" })],
        upsertEdges: [edge("e3", "b", "a")],
        deleteNodeIds: ["c"],
        deleteEdgeIds: ["e2"],
      },
      7,
    );
    expect(storage.syncCanvas).not.toHaveBeenCalled();
    expect(cache.write).toHaveBeenCalledWith(
      "ws",
      {
        nodes: [node("a"), node("b", { label: "updated" })],
        edges: [edge("e1", "a", "b"), edge("e3", "b", "a")],
        revision: 8,
      },
      7,
    );
  });

  it("rejects a stale delta without writing", async () => {
    storage.syncCanvasChanges.mockRejectedValue(
      new CanvasRevisionConflictError(6, 7),
    );
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/ws/canvas")
      .send({
        changes: { upsertNodes: [node("b")] },
        baseRevision: 6,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CANVAS_REVISION_CONFLICT");
    expect(res.body.revision).toBe(7);
    expect(storage.syncCanvas).not.toHaveBeenCalled();
  });

  it("rejects a delta whose merged graph is invalid", async () => {
    storage.syncCanvasChanges.mockRejectedValue(
      new CanvasInvalidGraphError([
        { path: "edges.0", message: "Edge source and target must exist." },
      ]),
    );
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/ws/canvas")
      .send({
        changes: {
          upsertEdges: [edge("bad", "a", "missing")],
        },
        baseRevision: 7,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CANVAS");
    expect(res.body.issues).toEqual([
      { path: "edges.0", message: "Edge source and target must exist." },
    ]);
    expect(storage.syncCanvas).not.toHaveBeenCalled();
  });

  it("rejects an empty delta", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/ws/canvas")
      .send({ changes: {}, baseRevision: 7 });

    expect(res.status).toBe(400);
    expect(storage.syncCanvasChanges).not.toHaveBeenCalled();
  });
});
