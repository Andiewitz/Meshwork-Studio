import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";
import { createChildLogger } from "./logger";

// ─── Singleton Redis Client ─────────────────────────────────────────
// Used for sessions, caching, and general key-value operations.
// For pub/sub, use createRedisClient() to get a dedicated connection.

const log = createChildLogger("redis");

let redis: RedisType | null = null;
let redisAvailable = false;
let redisDisabledLogged = false;

function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL;
  // Allow explicit disable with empty string
  if (url === "") return null;
  return url || "redis://localhost:6379";
}

/**
 * Get the singleton Redis client.
 * Lazily connects on first call. Returns null if Redis is not configured
 * or unavailable (allows graceful degradation in development).
 */
export function getRedis(): RedisType | null {
  if (redis) return redis;

  const url = getRedisUrl();
  if (!url) {
    if (!redisDisabledLogged) {
      log.info("Redis disabled (REDIS_URL empty)");
      redisDisabledLogged = true;
    }
    return null;
  }
  redisDisabledLogged = false;

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          log.warn("Max reconnection attempts reached, giving up");
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000); // Exponential backoff, max 2s
      },
      lazyConnect: true,
    });

    redis.on("connect", () => {
      redisAvailable = true;
      log.info("Connected successfully");
    });

    redis.on("error", (err) => {
      redisAvailable = false;
      if (redis?.status === "connecting") {
        log.warn({ err: err.message }, "Connection failed");
      }
    });

    redis.on("close", () => {
      redisAvailable = false;
    });

    // Attempt connection (non-blocking)
    redis.connect().catch((err) => {
      log.warn(
        { err: err.message },
        "Initial connection failed (degrading gracefully)",
      );
      redisAvailable = false;
    });

    return redis;
  } catch (err: unknown) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to create client",
    );
    return null;
  }
}

/**
 * Create a new, independent Redis connection.
 * Required for pub/sub (ioredis enters subscriber mode on the connection,
 * blocking it from other commands).
 */
export function createRedisClient(): RedisType | null {
  try {
    const url = getRedisUrl();
    if (!url) return null;

    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });
    return client;
  } catch (err: unknown) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to create pub/sub client",
    );
    return null;
  }
}

/**
 * Check if Redis is currently connected and responsive.
 * Used by the health check endpoint.
 */
export async function isRedisAvailable(): Promise<boolean> {
  getRedis();
  if (!redis) return false;
  if (redis.status === "wait") {
    try {
      await redis.connect();
    } catch {
      return false;
    }
  }
  if (!redisAvailable) return false;
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/**
 * Gracefully disconnect the singleton Redis client.
 * Call during server shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    redisAvailable = false;
  }
}
