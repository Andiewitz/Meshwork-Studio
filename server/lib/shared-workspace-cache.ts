import { getRedis } from "./redis";

const SHARED_TTL_SECONDS = 60;
export const sharedWorkspaceCacheKey = (userId: string) =>
  `access:sharedws:${userId}`;

/** Best-effort caching does not convert an unavailable Team service into an empty list. */
export async function readCachedSharedWorkspaceIds(
  userId: string,
): Promise<string[] | null> {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return null;
  try {
    const raw = await redis.get(sharedWorkspaceCacheKey(userId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((value) => typeof value === "string")
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function cacheSharedWorkspaceIds(
  userId: string,
  workspaceIds: string[],
): Promise<void> {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return;
  try {
    await redis.set(
      sharedWorkspaceCacheKey(userId),
      JSON.stringify(workspaceIds),
      "EX",
      SHARED_TTL_SECONDS,
    );
  } catch {
    // Redis failure leaves the validated HTTP response authoritative.
  }
}
