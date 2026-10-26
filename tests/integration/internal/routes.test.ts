import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requestIdMiddleware } from "@server/middleware/requestId";

const { countWorkspaces, getWorkspace, teamSelect } = vi.hoisted(() => ({
  countWorkspaces: vi.fn(async () => 11),
  getWorkspace: vi.fn(async (id: string) => ({
    id,
    userId: "owner",
    title: "Project",
  })),
  teamSelect: vi.fn(),
}));
vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: { countWorkspaces, getWorkspace },
}));
vi.mock("@services/team/db/connection", () => ({ db: { select: teamSelect } }));
vi.mock("@services/metrics/db/connection", () => ({ pool: {} }));

import { registerWorkspaceInternalRoutes } from "@services/workspace/db/internal-routes";
import { registerTeamInternalRoutes } from "@services/team/db/internal-routes";
import { queryMetricsCounts } from "@services/metrics/db/storage";

function buildApp(reverse = false) {
  const app = express();
  app.use(requestIdMiddleware);
  const register = reverse
    ? [registerTeamInternalRoutes, registerWorkspaceInternalRoutes]
    : [registerWorkspaceInternalRoutes, registerTeamInternalRoutes];
  register.forEach((mount) => mount(app));
  return app;
}

beforeEach(() => {
  vi.stubEnv("INTERNAL_API_KEY", "node-only-key");
  vi.stubEnv("AUTH_INTERNAL_KEY", "auth-only-key");
  vi.stubEnv("WORKSPACE_SERVICE_URL", "http://node:5000");
  vi.stubEnv("TEAM_SERVICE_URL", "http://node:5000");
  vi.stubEnv("AUTH_SERVICE_URL", "http://identity:8081");
  teamSelect.mockReturnValue({ from: vi.fn().mockResolvedValue([{ n: 7 }]) });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("colocated internal routers", () => {
  it.each([false, true])(
    "serves distinct counts in either registration order (reverse=%s)",
    async (reverse) => {
      const app = buildApp(reverse);
      expect(
        (
          await request(app)
            .get("/internal/v1/workspace/stats")
            .set("X-Internal-Key", "node-only-key")
        ).body,
      ).toEqual({ totalWorkspaces: 11 });
      expect(
        (
          await request(app)
            .get("/internal/v1/team/stats")
            .set("X-Internal-Key", "node-only-key")
        ).body,
      ).toEqual({ totalTeams: 7 });
      expect(
        (
          await request(app)
            .get("/internal/stats")
            .set("X-Internal-Key", "node-only-key")
        ).status,
      ).toBe(404);
    },
  );

  it.each([undefined, "incorrect", "auth-only-key", "é".repeat(13)])(
    "rejects a missing/wrong/identity credential: %s",
    async (key) => {
      const app = buildApp();
      for (const path of [
        "/internal/v1/workspace/stats",
        "/internal/v1/team/stats",
      ]) {
        const req = request(app).get(path).set("X-Request-Id", "aabb-ccdd");
        if (key) req.set("X-Internal-Key", key);
        const response = await req;
        expect(response.status).toBe(404);
        expect(response.body.requestId).toBe("aabb-ccdd");
      }
      expect(countWorkspaces).not.toHaveBeenCalled();
      expect(teamSelect).not.toHaveBeenCalled();
    },
  );

  it("uses the actual namespaced routers through the real metrics client", async () => {
    const app = buildApp();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
        if (String(url).startsWith("http://identity:8081")) {
          expect(options?.headers).toEqual({
            "X-Internal-Key": "auth-only-key",
            "X-Request-Id": "aabb-ccdd",
          });
          return Response.json({
            totalUsers: 19,
            newUsersToday: 2,
            activeUsers24h: 4,
            loginsToday: 6,
          });
        }
        const req = request(app).get(new URL(String(url)).pathname);
        for (const [name, value] of Object.entries(options?.headers ?? {}))
          req.set(name, String(value));
        const response = await req;
        return Response.json(response.body, { status: response.status });
      }),
    );
    await expect(queryMetricsCounts("aabb-ccdd")).resolves.toEqual({
      total_users: 19,
      new_users_today: 2,
      active_users_24h: 4,
      logins_today: 6,
      total_workspaces: 11,
      total_teams: 7,
    });
  });
});
