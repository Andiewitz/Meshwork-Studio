import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ counts: vi.fn(), insert: vi.fn() }));
vi.mock("@services/metrics/db/storage", () => ({
  queryMetricsCounts: mocks.counts,
  insertSnapshot: mocks.insert,
}));
vi.mock("@server/lib/metrics", () => ({
  metricsRegistry: { metrics: async () => "" },
}));
import {
  startCollector,
  stopCollector,
} from "@services/metrics/collector/collector";
afterEach(async () => {
  await stopCollector();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("metrics collector shutdown", () => {
  it("stops scheduling and waits for the active snapshot", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    mocks.counts.mockReturnValue(
      new Promise((resolve) => {
        release = () =>
          resolve({
            total_users: 0,
            new_users_today: 0,
            active_users_24h: 0,
            logins_today: 0,
            total_workspaces: 0,
            total_teams: 0,
          });
      }),
    );
    mocks.insert.mockResolvedValue(undefined);
    startCollector(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.counts).toHaveBeenCalledOnce();
    let stopped = false;
    const stopping = stopCollector().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.counts).toHaveBeenCalledOnce();
    release();
    await stopping;
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(stopped).toBe(true);
  });
});
