import { internalGet } from "@server/lib/internal";
import type { SharedWorkspaceReader } from "@services/team/public";
import { sharedWorkspaceIdsResponseSchema } from "@services/team/public";
import {
  readCachedSharedWorkspaceIds,
  cacheSharedWorkspaceIds,
} from "@server/lib/shared-workspace-cache";

export const sharedWorkspacesHttp: SharedWorkspaceReader = {
  async listIds(userId, requestId) {
    try {
      const cached = await readCachedSharedWorkspaceIds(userId);
      if (cached !== null) return { status: "available", value: cached };
      const result = await internalGet(
        "team",
        `/internal/v1/team/users/${encodeURIComponent(userId)}/shared-workspace-ids`,
        sharedWorkspaceIdsResponseSchema,
        { requestId },
      );
      await cacheSharedWorkspaceIds(userId, result.workspaceIds);
      return { status: "available", value: result.workspaceIds };
    } catch (cause) {
      return { status: "unavailable", cause };
    }
  },
};
