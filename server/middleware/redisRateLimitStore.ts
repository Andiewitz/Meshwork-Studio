// Redis-backed express-rate-limit store with an in-process fallback. The
// global API limiter runs after optional auth, so authenticated traffic is
// counted per user across replicas instead of per proxy IP.

import {
  MemoryStore,
  type ClientRateLimitInfo,
  type Options,
  type Store,
} from "express-rate-limit";
import { getRedis } from "@server/lib/redis";

const INCREMENT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;

const DECREMENT_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current > 0 then
  return redis.call("DECR", KEYS[1])
end
return 0
`;

export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  private readonly memory = new MemoryStore();
  private windowMs = 60_000;

  constructor(readonly prefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  private redisKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redis = getRedis();
    if (!redis || redis.status !== "ready") return this.memory.increment(key);
    try {
      const result = (await redis.eval(
        INCREMENT_SCRIPT,
        1,
        this.redisKey(key),
        this.windowMs,
      )) as [number, number];
      const totalHits = result[0];
      const ttl = result[1];
      return {
        totalHits,
        resetTime: ttl > 0 ? new Date(Date.now() + ttl) : undefined,
      };
    } catch {
      return this.memory.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis || redis.status !== "ready") return this.memory.decrement(key);
    try {
      await redis.eval(DECREMENT_SCRIPT, 1, this.redisKey(key));
    } catch {
      await this.memory.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedis();
    if (redis && redis.status === "ready") {
      try {
        await redis.del(this.redisKey(key));
      } catch {
        // Fall through to the local store.
      }
    }
    await this.memory.resetKey(key);
  }

  shutdown(): Promise<void> | void {
    return this.memory.shutdown();
  }
}
