import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { requestIdMiddleware } from "@server/middleware/requestId";

vi.mock("@services/canvas/db/storage", () => ({
  canvasStorage: {
    getCanvas: vi.fn(async () => ({ nodes: [], edges: [], revision: 7 })),
    getNodes: vi.fn(async () => []),
    getEdges: vi.fn(async () => []),
    getCanvasRevision: vi.fn(async () => 7),
    syncCanvas: vi.fn(async () => 8),
  },
}));

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
          return (req: any, res: any, next: any) => {
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

const goodNode = (id: string) => ({
  id,
  type: "service",
  position: { x: 10, y: 20 },
  data: { label: id },
});
const goodEdge = (id: string) => ({
  id,
  source: "a",
  target: "b",
});

describe("POST /api/v1/workspaces/:id/import-canvas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("422s files that are not canvases at all", async () => {
    const app = await buildApp();
    for (const body of [
      { settings: { theme: "dark" } },
      { nodes: "nope", edges: [] },
      [],
      {},
    ]) {
      const res = await request(app)
        .post("/api/v1/workspaces/w1/import-canvas")
        .send(body);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("NOT_A_CANVAS_FILE");
      expect(res.body.message).toContain("nodes");
      expect(res.body.requestId).toMatch(/^req-[0-9a-f]{24}$/);
    }
  });

  it("imports survivors and reports the dropped pieces", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/w1/import-canvas")
      .send({
        nodes: [
          goodNode("a"),
          goodNode("b"),
          { type: "service", position: { x: 0, y: 0 }, data: {} }, // no id
          "junk",
        ],
        edges: [goodEdge("e1"), { id: "e2", source: "a" }], // no target
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({ nodes: 2, edges: 1 });
    expect(res.body.dropped).toEqual({ nodes: 2, edges: 1 });
    expect(res.body.warnings).toHaveLength(3);
    expect(res.body.revision).toBe(8);
    expect(res.body.requestId).toMatch(/^req-[0-9a-f]{24}$/);
  });

  it("422s when nothing in the file is usable", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/w1/import-canvas")
      .send({ nodes: [{ nope: true }], edges: [42] });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("NOTHING_IMPORTABLE");
    expect(res.body.warnings.length).toBeGreaterThan(0);
  });

  it("imports a clean file exactly, with zero drops", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/w1/import-canvas")
      .send({ nodes: [goodNode("a")], edges: [goodEdge("e1")] });

    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({ nodes: 1, edges: 1 });
    expect(res.body.dropped).toEqual({ nodes: 0, edges: 0 });
    expect(res.body.warnings).toEqual([]);
  });

  it("422s files over the item caps", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/v1/workspaces/w1/import-canvas")
      .send({
        nodes: Array.from({ length: 5001 }, (_, i) => goodNode(`n${i}`)),
        edges: [],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("IMPORT_TOO_LARGE");
  });
});
