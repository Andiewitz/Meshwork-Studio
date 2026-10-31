import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  enabled: true,
  eval: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@server/lib/redis", () => ({
  getRedis: () =>
    redis.enabled
      ? { status: "ready", eval: redis.eval, del: redis.del }
      : null,
}));

import { RedisRateLimitStore } from "@server/middleware/redisRateLimitStore";
import type { Options } from "express-rate-limit";

const options = { windowMs: 60_000 } as Options;

describe("RedisRateLimitStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.enabled = true;
  });

  it("increments through Redis with an expiry-derived reset time", async () => {
    redis.eval.mockResolvedValueOnce([7, 42_000]);
    const store = new RedisRateLimitStore("ratelimit:api");
    store.init(options);

    const info = await store.increment("user:u1");

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      1,
      "ratelimit:api:user:u1",
      60_000,
    );
    expect(info.totalHits).toBe(7);
    expect(info.resetTime).toBeInstanceOf(Date);
    expect(info.resetTime?.getTime() ?? 0).toBeGreaterThan(Date.now() + 40_000);
  });

  it("falls back to the in-process store when Redis fails", async () => {
    redis.eval.mockRejectedValueOnce(new Error("redis down"));
    const store = new RedisRateLimitStore("ratelimit:api");
    store.init(options);

    const first = await store.increment("ip:1.2.3.4");
    expect(first.totalHits).toBe(1);

    const second = await store.increment("ip:1.2.3.4");
    expect(second.totalHits).toBe(2);
  });

  it("falls back to the in-process store when Redis is disabled", async () => {
    redis.enabled = false;
    const store = new RedisRateLimitStore("ratelimit:api");
    store.init(options);

    const info = await store.increment("ip:1.2.3.4");

    expect(info.totalHits).toBe(1);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("decrements and resets through Redis", async () => {
    redis.eval.mockResolvedValueOnce(1);
    const store = new RedisRateLimitStore("ratelimit:api");
    store.init(options);

    await store.decrement("user:u1");
    await store.resetKey("user:u1");

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("DECR"),
      1,
      "ratelimit:api:user:u1",
    );
    expect(redis.del).toHaveBeenCalledWith("ratelimit:api:user:u1");
  });
});
