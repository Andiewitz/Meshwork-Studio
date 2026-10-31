import { describe, expect, it, vi } from "vitest";
import { coreReady } from "@server/lib/readiness";
describe("document readiness", () => {
  it("requires a usable canvas and fails closed on a probe error", async () => {
    const opts = {
      started: true,
      postgres: true,
      redisRequired: false,
      redis: false,
      canvas: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(new Error("offline")),
    };
    await expect(coreReady(opts)).resolves.toBe(true);
    await expect(coreReady(opts)).resolves.toBe(false);
    await expect(coreReady(opts)).resolves.toBe(false);
  });
  it("does not probe Canvas while stopped or required dependencies are down", async () => {
    const canvas = vi.fn();
    const opts = {
      started: false,
      postgres: true,
      redisRequired: false,
      redis: false,
      canvas,
    };
    await expect(coreReady(opts)).resolves.toBe(false);
    await expect(
      coreReady({ ...opts, started: true, postgres: false }),
    ).resolves.toBe(false);
    await expect(
      coreReady({ ...opts, started: true, redisRequired: true }),
    ).resolves.toBe(false);
    expect(canvas).not.toHaveBeenCalled();
  });
});
