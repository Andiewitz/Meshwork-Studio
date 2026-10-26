import { internalGet } from "@server/lib/internal";
import type { SharedWorkspaceReader } from "@services/team/public";
import { sharedWorkspaceIdsResponseSchema } from "@services/team/public";

export const sharedWorkspacesHttp: SharedWorkspaceReader = {
  async listIds(userId, requestId) {
    try {
      const result = await internalGet(
        "team",
        `/internal/v1/team/users/${encodeURIComponent(userId)}/shared-workspace-ids`,
        sharedWorkspaceIdsResponseSchema,
        { requestId },
      );
      return { status: "available", value: result.workspaceIds };
    } catch (cause) {
      return { status: "unavailable", cause };
    }
  },
};
