import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { requestIdMiddleware } from "@server/middleware/requestId";
import { createTeamWorkspaceAccess } from "@services/team/public";
import type { WorkspaceRouteDependencies } from "@services/workspace/dependencies";

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
  const context: WorkspaceRouteDependencies = {
    isAuthenticated: (req, _res, next) => {
      req.user = { id: "user-1" } as typeof req.user;
      next();
    },
    directAccess: {
      getAccess: async (workspaceId, userId) => {
        try {
          const allowed = await teamStorage.canAccessWorkspace(
            userId,
            workspaceId,
          );
          return { status: "available", value: allowed ? "view" : "none" };
        } catch (cause) {
          return { status: "unavailable", cause };
        }
      },
    },
  };
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

  it("preserves a Team outage as 503, not a misleading 403", async () => {
    getWorkspace.mockResolvedValueOnce({ id: "w1", userId: "someone-else" });
    teamStorage.canAccessWorkspace.mockRejectedValueOnce(
      new Error("Team offline"),
    );
    const res = await request(await buildApp()).get("/api/v1/workspaces/w1");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      code: "WORKSPACE_UNAVAILABLE",
      requestId: expect.stringMatching(/^req-/),
    });
  });

  it("does not consult Team for a direct owner", async () => {
    getWorkspace.mockResolvedValueOnce({ id: "w1", userId: "user-1" });
    const res = await request(await buildApp()).get("/api/v1/workspaces/w1");
    expect(res.status).toBe(200);
    expect(teamStorage.canAccessWorkspace).not.toHaveBeenCalled();
    expect(teamStorage.getWorkspaceRole).not.toHaveBeenCalled();
  });
});
