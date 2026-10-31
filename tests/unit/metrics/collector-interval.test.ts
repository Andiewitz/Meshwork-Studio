import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  metrics: vi.fn(),
  counts: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@services/metrics/db/storage", () => ({
  queryMetricsCounts: mocks.counts,
  insertSnapshot: mocks.insert,
}));
vi.mock("@server/lib/metrics", () => ({
  metricsRegistry: { metrics: mocks.metrics },
}));
import { snapshotMetrics } from "@services/metrics/collector/collector";
function text(sum: number, count: number) {
  return `http_requests_total ${count}\nhttp_request_duration_seconds_sum{method="GET",path="/a"} ${sum}\nhttp_request_duration_seconds_count{method="GET",path="/a"} ${count}\n`;
}
describe("collector interval persistence", () => {
  it("preserves unpersisted observations when an insert fails", async () => {
    mocks.counts.mockResolvedValue({
      total_users: 0,
      new_users_today: 0,
      active_users_24h: 0,
      logins_today: 0,
      total_workspaces: 0,
      total_teams: 0,
    });
    mocks.metrics
      .mockResolvedValueOnce(text(1, 10))
      .mockResolvedValueOnce(text(2, 20))
      .mockResolvedValueOnce(text(5, 30));
    mocks.insert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("DB offline"))
      .mockResolvedValueOnce(undefined);
    await snapshotMetrics();
    await snapshotMetrics();
    await snapshotMetrics();
    expect(mocks.insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ avgDurationMs: 100, requestRate: 10 }),
    );
    expect(mocks.insert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ avgDurationMs: 200, requestRate: 20 }),
    );
  });
});
