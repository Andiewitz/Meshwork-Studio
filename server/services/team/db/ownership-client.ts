// Internal HTTP clients used by the team service to reach data it does NOT
// own (workspace ownership lives in workspace_db). Responses feed a local
// read-through mirror so role checks stay one local query.

import { internalGet } from "@server/lib/internal";
import { z } from "zod";

const ownershipResponse = z.object({
  workspaces: z.array(
    z.object({
      id: z.string().min(1),
      ownerId: z.string(),
      title: z.string(),
    }),
  ),
});
const sharedIdsResponse = z.object({
  workspaceIds: z.array(z.string().min(1)),
});

export interface WorkspaceOwnership {
  id: string;
  ownerId: string;
  title: string;
}

/** Batch-fetch ownership for unknown workspace ids. Returns what the
 *  workspace service knows about; unknown ids are simply absent. */
export async function fetchWorkspaceOwners(
  ids: string[],
  requestId?: string,
): Promise<WorkspaceOwnership[]> {
  if (ids.length === 0) return [];
  const qs = encodeURIComponent(ids.join(","));
  const res = await internalGet(
    "workspace",
    `/internal/v1/workspace/lookup?ids=${qs}`,
    ownershipResponse,
    { requestId },
  );
  return res.workspaces;
}

/** Shared-workspace ids for a user, per the team↔workspace links. */
export async function fetchSharedWorkspaceIds(
  userId: string,
  requestId?: string,
): Promise<string[]> {
  const res = await internalGet(
    "team",
    `/internal/v1/team/users/${encodeURIComponent(userId)}/shared-workspace-ids`,
    sharedIdsResponse,
    { requestId },
  );
  return res.workspaceIds;
}
