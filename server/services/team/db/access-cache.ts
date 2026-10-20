// Redis read-through cache for the two hottest authorization lookups:
// a user's role on a workspace and the workspace ids shared with a user.
// Redis failure always falls through to the database; entries are short-lived
// and invalidated on membership mutations so revocation is not TTL-bound.

import type { Redis } from "ioredis";
import { getRedis } from "@server/lib/redis";
import type { TeamRole } from "./schema";

export type WorkspaceRole = TeamRole | "workspace-owner";

const ROLE_TTL_SECONDS = 60;
const SHARED_TTL_SECONDS = 60;
const DELETE_BATCH = 500;

function roleKey(workspaceId: string, userId: string): string {
  return `access:role:${workspaceId}:${userId}`;
}

function sharedKey(userId: string): string {
  return `access:sharedws:${userId}`;
}

async function deleteKeys(redis: Redis, keys: string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += DELETE_BATCH) {
    await redis.del(...keys.slice(index, index + DELETE_BATCH));
  }
}

export async function readCachedWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<{ hit: boolean; value: WorkspaceRole | null }> {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return { hit: false, value: null };
  try {
    const raw = await redis.get(roleKey(workspaceId, userId));
    if (raw === null) return { hit: false, value: null };
    const parsed = JSON.parse(raw) as { role?: WorkspaceRole | null };
    if (!("role" in parsed)) return { hit: false, value: null };
    return { hit: true, value: parsed.role ?? null };
  } catch {
    return { hit: false, value: null };
  }
}

export async function cacheWorkspaceRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole | null,
): Promise<void> {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return;
  try {
    await redis.set(
      roleKey(workspaceId, userId),
      JSON.stringify({ role }),
      "EX",
      ROLE_TTL_SECONDS,
    );
  } catch {
    // Cache is best effort; the database path remains authoritative.
  }
}

export async function readCachedSharedWorkspaceIds(
  userId: string,
): Promise<string[] | null> {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return null;
  try {
    const raw = await redis.get(sharedKey(userId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const workspaceIds = parsed.filter(
      (value): value is string => typeof value === "string",
    );
    return workspaceIds.length === parsed.length ? workspaceIds : null;
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
      sharedKey(userId),
      JSON.stringify(workspaceIds),
      "EX",
      SHARED_TTL_SECONDS,
    );
  } catch {
    // Cache is best effort; the internal API path remains authoritative.
  }
}

/**
 * Drop every role key for the workspace/user cross-product plus the shared
 * workspace list for each user. Team mutations use this instead of trying to
 * track exactly which cached keys a membership change could have populated.
 */
export async function invalidateWorkspaceAccess(
  workspaceIds: string[],
  userIds: string[],
): Promise<void> {
  if (workspaceIds.length === 0 && userIds.length === 0) return;
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return;
  const keys: string[] = [];
  for (const workspaceId of workspaceIds) {
    for (const userId of userIds) {
      keys.push(roleKey(workspaceId, userId));
    }
  }
  for (const userId of userIds) keys.push(sharedKey(userId));
  try {
    await deleteKeys(redis, keys);
  } catch {
    // Cache invalidation is best effort; the 60s TTL bounds stale access.
  }
}
