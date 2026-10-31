import type { WorkspaceAccess } from "@shared/schema/workspace-contract";
import type { Lookup, QueryResult } from "@server/lib/module-outcomes";
import { readLookup } from "@server/lib/module-outcomes";
import { workspaceOwnershipResponseSchema } from "@shared/contracts/workspace-queries";
import type { z } from "zod";
export { workspaceOwnershipResponseSchema };

export interface WorkspaceSummary {
  id: string;
  userId: string | null;
  canvasCopyStatus?: "ready" | "copying" | "failed";
}

/** Read-only capability. No repository, SQL row, or transaction escapes. */
export interface WorkspaceSummaryReader {
  lookup(id: string): Promise<Lookup<WorkspaceSummary>>;
}

export async function getWorkspaceSummary(
  reader: WorkspaceSummaryReader,
  id: string,
) {
  return readLookup(await reader.lookup(id));
}

export type WorkspaceOwnership = z.infer<
  typeof workspaceOwnershipResponseSchema
>["workspaces"][number];

export interface WorkspaceOwnershipReader {
  lookupOwners(
    ids: string[],
    requestId?: string,
  ): Promise<QueryResult<WorkspaceOwnership[]>>;
}

/** Owner-side adapter: deliberately project fields instead of returning a row. */
export function createWorkspaceSummaryReader(source: {
  getWorkspace(id: string): Promise<WorkspaceSummary | null | undefined>;
}): WorkspaceSummaryReader {
  return {
    async lookup(id) {
      try {
        const row = await source.getWorkspace(id);
        if (!row) return { status: "missing" };
        return {
          status: "found",
          value: {
            id: row.id,
            userId: row.userId,
            canvasCopyStatus: row.canvasCopyStatus,
          },
        };
      } catch (cause) {
        return { status: "unavailable", cause };
      }
    },
  };
}

/** Workspace owns direct collaborator permissions. A failed lookup is never a denial. */
export interface WorkspaceAccessReader {
  getAccess(
    workspaceId: string,
    userId: string,
  ): Promise<QueryResult<WorkspaceAccess>>;
}

export function createWorkspaceAccessReader(source: {
  getWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccess>;
}): WorkspaceAccessReader {
  return {
    async getAccess(workspaceId, userId) {
      try {
        return {
          status: "available",
          value: await source.getWorkspaceAccess(workspaceId, userId),
        };
      } catch (cause) {
        return { status: "unavailable", cause };
      }
    },
  };
}
