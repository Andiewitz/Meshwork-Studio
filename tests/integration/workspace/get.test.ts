import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { requestIdMiddleware } from "@server/middleware/requestId";

vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: {
    getWorkspace: vi.fn(),
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

const { workspaceStorage } = await import("@services/workspace/db/storage");
const getWorkspace = workspaceStorage.getWorkspace as ReturnType<typeof vi.fn>;

const teamStorage = { getWorkspaceRole: vi.fn(), canAccessWorkspace: vi.fn() };

async function buildApp() {
  const { registerWorkspaceRoutes } =
    await import("@services/workspace/routes/workspaceRoutes");
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
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
  registerWorkspaceRoutes(app, context);
  return app;
}

describe("GET /api/v1/workspaces/:id open path (regression: opaque 500s)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces DB failure as 503 with code + requestId, never bare 500", async () => {
    getWorkspace.mockRejectedValueOnce(new Error("connection terminated"));
    const app = await buildApp();
    const res = await request(app).get("/api/v1/workspaces/w1");

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("WORKSPACE_UNAVAILABLE");
    expect(res.body.requestId).toMatch(/^req-[0-9a-f]{24}$/);
  });

  it("404 carries the request ID for joinability", async () => {
    getWorkspace.mockResolvedValueOnce(undefined);
    const app = await buildApp();
    const res = await request(app).get("/api/v1/workspaces/missing");

    expect(res.status).toBe(404);
    expect(res.body.requestId).toMatch(/^req-[0-9a-f]{24}$/);
  });

  it("403 carries the request ID for joinability", async () => {
    getWorkspace.mockResolvedValueOnce({ id: "w1", userId: "someone-else" });
    teamStorage.canAccessWorkspace.mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await request(app).get("/api/v1/workspaces/w1");

    expect(res.status).toBe(403);
    expect(res.body.requestId).toMatch(/^req-[0-9a-f]{24}$/);
  });

  it("still returns the workspace for the owner", async () => {
    getWorkspace.mockResolvedValueOnce({ id: "w1", userId: "user-1" });
    const app = await buildApp();
    const res = await request(app).get("/api/v1/workspaces/w1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("w1");
  });
});
