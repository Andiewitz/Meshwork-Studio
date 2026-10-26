import { z } from "zod";

/** /internal/v1/workspace/lookup response. No version field added to HTTP. */
export const workspaceOwnershipResponseSchema = z.object({
  workspaces: z.array(
    z.object({ id: z.string().min(1), ownerId: z.string(), title: z.string() }),
  ),
});
