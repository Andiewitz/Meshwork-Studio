import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@services/metrics/db/connection", () => ({ pool: { query } }));

import {
  queryMetricsCounts,
  insertSnapshot,
} from "@services/metrics/db/storage";
import {
  metricsSnapshots,
  insertMetricsSnapshotSchema,
} from "@services/metrics/db/schema";

const authStats = {
  totalUsers: 19,
  newUsersToday: 2,
  activeUsers24h: 4,
  loginsToday: 6,
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("AUTH_INTERNAL_KEY", "auth-only");
  vi.stubEnv("INTERNAL_API_KEY", "node-only");
  vi.stubEnv("AUTH_SERVICE_URL", "http://auth:8081");
  vi.stubEnv("WORKSPACE_SERVICE_URL", "http://workspace:5000");
  vi.stubEnv("TEAM_SERVICE_URL", "http://team:5000");
  vi.stubGlobal("fetch", fetchMock);
  query.mockReset();
  fetchMock.mockImplementation((url) => {
    const target = String(url);
    if (target.includes("auth:8081"))
      return Promise.resolve(Response.json(authStats));
    if (target.includes("/workspace/"))
      return Promise.resolve(Response.json({ totalWorkspaces: 11 }));
    return Promise.resolve(Response.json({ totalTeams: 7 }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe("domain metric collection", () => {
  it("collects validated distinct counts with the correct credentials/context", async () => {
    await expect(queryMetricsCounts("abcd-1234")).resolves.toEqual({
      total_users: 19,
      new_users_today: 2,
      active_users_24h: 4,
      logins_today: 6,
      total_workspaces: 11,
      total_teams: 7,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://auth:8081/internal/stats/users",
      expect.objectContaining({
        headers: { "X-Internal-Key": "auth-only", "X-Request-Id": "abcd-1234" },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://team:5000/internal/v1/team/stats",
      expect.objectContaining({
        headers: { "X-Internal-Key": "node-only", "X-Request-Id": "abcd-1234" },
      }),
    );
  });

  it.each(["http", "malformed", "transport"])(
    "keeps auth gaps separate from healthy counts on %s failure",
    async (failure) => {
      const healthyFetch = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url, init) => {
        if (!String(url).includes("auth:8081")) return healthyFetch(url, init);
        if (failure === "transport")
          return Promise.reject(new Error("offline"));
        return Promise.resolve(
          failure === "http"
            ? new Response("", { status: 401 })
            : Response.json({ totalUsers: 19 }),
        );
      });
      await expect(queryMetricsCounts()).resolves.toMatchObject({
        total_users: null,
        new_users_today: null,
        active_users_24h: null,
        logins_today: null,
        total_workspaces: 11,
        total_teams: 7,
      });
    },
  );

  it("does not turn a response from the wrong service into zero teams", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ totalWorkspaces: 11 }),
    );
    await expect(queryMetricsCounts()).resolves.toMatchObject({
      total_teams: null,
    });
  });

  it("preserves real zeros", async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        Response.json(
          String(url).includes("auth:8081")
            ? {
                totalUsers: 0,
                newUsersToday: 0,
                activeUsers24h: 0,
                loginsToday: 0,
              }
            : String(url).includes("/workspace/")
              ? { totalWorkspaces: 0 }
              : { totalTeams: 0 },
        ),
      ),
    );
    await expect(queryMetricsCounts()).resolves.toEqual({
      total_users: 0,
      new_users_today: 0,
      active_users_24h: 0,
      logins_today: 0,
      total_workspaces: 0,
      total_teams: 0,
    });
  });

  it("does not issue HTTP calls or fabricate values when keys are absent", async () => {
    vi.stubEnv("AUTH_INTERNAL_KEY", "");
    vi.stubEnv("INTERNAL_API_KEY", "");
    await expect(queryMetricsCounts()).resolves.toEqual({
      total_users: null,
      new_users_today: null,
      active_users_24h: null,
      logins_today: null,
      total_workspaces: null,
      total_teams: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists null counts and keeps real zero counts in SQL parameters", async () => {
    await insertSnapshot({
      totalRequests: 1,
      requestRate: 1,
      avgDurationMs: 1,
      memoryMb: 1,
      cpuSeconds: 1,
      eventLoopLagMs: 1,
      wsConnections: 0,
      wsRooms: 0,
      aiRequests: 0,
      totalUsers: null,
      newUsersToday: null,
      activeUsers24h: null,
      loginsToday: null,
      totalWorkspaces: 0,
      totalTeams: 7,
    });
    expect(query.mock.calls[0][1].slice(-6)).toEqual([
      null,
      null,
      null,
      null,
      0,
      7,
    ]);
    expect(
      insertMetricsSnapshotSchema.safeParse({ totalUsers: null }).success,
    ).toBe(true);
    expect(metricsSnapshots.totalUsers.notNull).toBe(false);
  });
});
