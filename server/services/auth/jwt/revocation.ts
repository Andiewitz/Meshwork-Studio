import { createChildLogger } from "@server/lib/logger";
import { getRedis } from "@server/lib/redis";

const log = createChildLogger("auth-jwt-revocation");

/**
 * Revokes a specific refresh token by its JTI (JWT ID).
 * The revocation is stored in Redis for 7 days (the max lifetime of a refresh token).
 */
export async function revokeRefreshToken(jti: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    log.warn(
      "Redis is not available, token revocation will not be persisted across restarts",
    );
    return;
  }

  // 7 days in seconds
  const TTL_SECONDS = 7 * 24 * 60 * 60;
  try {
    await redis.setex(`revoked_jti:${jti}`, TTL_SECONDS, "1");
    log.debug({ jti }, "Refresh token revoked successfully");
  } catch (err) {
    log.error({ err, jti }, "Failed to revoke refresh token in Redis");
  }
}

/**
 * Revokes a specific access token by its JTI (JWT ID).
 * The revocation is stored in Redis for 15 minutes (the max lifetime of an access token).
 */
export async function revokeAccessToken(jti: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    log.warn("Redis is not available, access token revocation not persisted");
    return;
  }
  // 15 minutes in seconds — matches ACCESS_TOKEN_EXPIRATION
  const TTL_SECONDS = 15 * 60;
  try {
    await redis.setex(`revoked_jti:${jti}`, TTL_SECONDS, "1");
    log.debug({ jti }, "Access token revoked");
  } catch (err) {
    log.error({ err, jti }, "Failed to revoke access token in Redis");
  }
}

/**
 * Checks if a specific token (by its JTI) has been revoked.
 */
export async function isRefreshTokenRevoked(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    log.warn("Redis is not available, cannot verify token revocation status");
    return false;
  }

  try {
    const isRevoked = await redis.exists(`revoked_jti:${jti}`);
    return isRevoked === 1;
  } catch (err) {
    log.error({ err, jti }, "Failed to check token revocation status in Redis");
    return false;
  }
}
