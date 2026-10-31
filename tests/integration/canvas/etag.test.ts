import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { requestIdMiddleware } from "@server/middleware/requestId";
import { createWorkspaceSummaryReader } from "@services/workspace/public";
import { createTeamWorkspaceAccess } from "@services/team/public";
import type { CanvasRouteDependencies } from "@services/canvas/dependencies";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  invalidate: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  syncCanvas: vi.fn(),
}));

vi.mock("@services/canvas/db/storage", () => ({ canvasStorage: storage }));

vi.mock("@services/canvas/cache", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@services/canvas/cache")>();
  return {
    ...actual,
    readCachedCanvas: mocks.read,
    cacheCanvas: mocks.write,
    invalidateCanvas: mocks.invalidate,
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
    canvasCopyStatus: "ready" as const,
  })),
};
const teamStorage = {
  getWorkspaceRole: vi.fn(async () => "owner" as const),
  canAccessWorkspace: vi.fn(async () => true),
};

async function buildApp() {
  const { registerCanvasRoutes } =
    await import("@services/canvas/routes/canvasRoutes");
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "5mb" }));
  const context: CanvasRouteDependencies = {
    isAuthenticated: (req, _res, next) => {
      req.user = { id: "user-1" } as typeof req.user;
      next();
    },
    workspaces: createWorkspaceSummaryReader(workspaceStorage),
    directAccess: {
      getAccess: async () => ({ status: "available", value: "none" }),
    },
  };
  registerCanvasRoutes(app, context);
  return app;
}

const snapshot = { nodes: [], edges: [], revision: 7 };
const node = { id: "n1", position: { x: 0, y: 0 }, data: {} };

describe("canvas ETag routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(null);
    mocks.write.mockResolvedValue(undefined);
    mocks.invalidate.mockResolvedValue(undefined);
  });

  it("returns 304 from cache without touching storage", async () => {
    mocks.read.mockResolvedValue(snapshot);
    const app = await buildApp();

    const res = await request(app)
      .get("/api/v1/workspaces/ws/canvas")
      .set("If-None-Match", '"7"');

    expect(res.status).toBe(304);
    expect(res.headers.etag).toBe('"7"');
    expect(storage.getCanvas).not.toHaveBeenCalled();
  });

  it("writes a cache miss and returns the ETag", async () => {
    storage.getCanvas.mockResolvedValue(snapshot);
    const app = await buildApp();

    const res = await request(app).get("/api/v1/workspaces/ws/canvas");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(snapshot);
    expect(res.headers.etag).toBe('"7"');
    expect(mocks.write).toHaveBeenCalledWith("ws", snapshot);
  });

  it("updates the cache after a save and returns the new ETag", async () => {
    storage.syncCanvas.mockResolvedValue(8);
    const app = await buildApp();

    const res = await request(app)
      .post("/api/v1/workspaces/ws/canvas")
      .send({ nodes: [node], edges: [], baseRevision: 7 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, revision: 8 });
    expect(res.headers.etag).toBe('"8"');
    expect(mocks.write).toHaveBeenCalledWith(
      "ws",
      { nodes: [node], edges: [], revision: 8 },
      7,
    );
  });
});
