import { createChildLogger } from "@server/lib/logger";
import { getRedis } from "@server/lib/redis";
import type { CanvasSnapshot } from "./db/model";

const log = createChildLogger("canvas-cache");
const CACHE_TTL_SECONDS = 600;

const revisionKey = (workspaceId: string) => `canvas:${workspaceId}:rev`;
const snapshotKey = (workspaceId: string, revision: number) =>
  `canvas:${workspaceId}:${revision}`;

const CACHE_WRITE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current and tonumber(current) and tonumber(current) > tonumber(ARGV[1]) then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])
if ARGV[4] ~= "" then
  redis.call("DEL", ARGV[4])
end
return 1
`;

export function canvasEtag(revision: number): string {
  return `"${revision}"`;
}

export function etagMatches(
  header: string | undefined,
  revision: number,
): boolean {
  if (!header) return false;
  const target = canvasEtag(revision);
  return header.split(",").some((part) => {
    const tag = part.trim();
    return tag === "*" || tag.replace(/^W\//, "") === target;
  });
}

export async function readCachedCanvas(
  workspaceId: string,
): Promise<CanvasSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const rawRevision = await redis.get(revisionKey(workspaceId));
    if (!rawRevision) return null;
    const revision = Number(rawRevision);
    if (!Number.isInteger(revision) || revision < 0) return null;

    const raw = await redis.get(snapshotKey(workspaceId, revision));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanvasSnapshot;
    return parsed.revision === revision ? parsed : null;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), workspaceId },
      "Canvas cache read failed",
    );
    return null;
  }
}

export async function cacheCanvas(
  workspaceId: string,
  snapshot: CanvasSnapshot,
  previousRevision?: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.eval(
      CACHE_WRITE_SCRIPT,
      2,
      revisionKey(workspaceId),
      snapshotKey(workspaceId, snapshot.revision),
      String(snapshot.revision),
      JSON.stringify(snapshot),
      String(CACHE_TTL_SECONDS),
      previousRevision === undefined || previousRevision === snapshot.revision
        ? ""
        : snapshotKey(workspaceId, previousRevision),
    );
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), workspaceId },
      "Canvas cache write failed",
    );
  }
}

export async function invalidateCanvas(workspaceId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(revisionKey(workspaceId));
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), workspaceId },
      "Canvas cache invalidation failed",
    );
  }
}
