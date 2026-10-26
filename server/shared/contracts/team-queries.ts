import { z } from "zod";

/** /internal/v1/team/users/:id/shared-workspace-ids response. */
export const sharedWorkspaceIdsResponseSchema = z.object({
  workspaceIds: z.array(z.string().min(1)),
});
