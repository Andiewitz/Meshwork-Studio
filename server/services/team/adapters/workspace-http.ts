import { internalGet } from "@server/lib/internal";
import type { WorkspaceOwnershipReader } from "@services/workspace/public";
import { z } from "zod";

const ownershipResponse = z.object({
  workspaces: z.array(
    z.object({ id: z.string().min(1), ownerId: z.string(), title: z.string() }),
  ),
});

/** Read-through mirror transport; unknown IDs and an unavailable owner are distinct. */
export const workspaceOwnershipHttp: WorkspaceOwnershipReader = {
  async lookupOwners(ids, requestId) {
    if (ids.length === 0) return { status: "available", value: [] };
    try {
      const result = await internalGet(
        "workspace",
        `/internal/v1/workspace/lookup?ids=${encodeURIComponent(ids.join(","))}`,
        ownershipResponse,
        { requestId },
      );
      return { status: "available", value: result.workspaces };
    } catch (cause) {
      return { status: "unavailable", cause };
    }
  },
};
