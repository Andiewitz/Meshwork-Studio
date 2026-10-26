import { describe, expect, it, vi } from "vitest";

const { counts, insert } = vi.hoisted(() => ({
  counts: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@services/metrics/db/storage", () => ({
  queryMetricsCounts: counts,
  insertSnapshot: insert,
}));
vi.mock("@server/lib/metrics", () => ({
  metricsRegistry: { metrics: async () => "http_requests_total 0\n" },
}));
import { snapshotMetrics } from "@services/metrics/collector/collector";

describe("metrics snapshot availability", () => {
  it("does not coalesce dependency gaps to zero before persistence", async () => {
    counts.mockResolvedValue({
      total_users: null,
      new_users_today: null,
      active_users_24h: null,
      logins_today: null,
      total_workspaces: 0,
      total_teams: 7,
    });
    await snapshotMetrics();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        totalUsers: null,
        newUsersToday: null,
        activeUsers24h: null,
        loginsToday: null,
        totalWorkspaces: 0,
        totalTeams: 7,
      }),
    );
  });
});
