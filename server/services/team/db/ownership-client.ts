// Internal HTTP clients used by the team service to reach data it does NOT
// own (workspace ownership lives in workspace_db). Responses feed a local
// read-through mirror so role checks stay one local query.

import { internalGet } from "@server/lib/internal";
import {
  cacheSharedWorkspaceIds,
  readCachedSharedWorkspaceIds,
} from "./access-cache";

export interface WorkspaceOwnership {
  id: string;
  ownerId: string;
  title: string;
}

/** Batch-fetch ownership for unknown workspace ids. Returns what the
 *  workspace service knows about; unknown ids are simply absent. */
export async function fetchWorkspaceOwners(
  ids: string[],
): Promise<WorkspaceOwnership[]> {
  if (ids.length === 0) return [];
  const qs = encodeURIComponent(ids.join(","));
  const res = await internalGet<{ workspaces: WorkspaceOwnership[] }>(
    "workspace",
    `/internal/workspaces/lookup?ids=${qs}`,
  );
  return res?.workspaces ?? [];
}

/** Shared-workspace ids for a user, per the team↔workspace links. */
export async function fetchSharedWorkspaceIds(
  userId: string,
): Promise<string[]> {
  const cached = await readCachedSharedWorkspaceIds(userId);
  if (cached !== null) return cached;

  const res = await internalGet<{ workspaceIds: string[] }>(
    "team",
    `/internal/users/${encodeURIComponent(userId)}/shared-workspace-ids`,
  );
  if (!res) return [];
  const workspaceIds = res.workspaceIds.filter((id) => typeof id === "string");
  await cacheSharedWorkspaceIds(userId, workspaceIds);
  return workspaceIds;
}
