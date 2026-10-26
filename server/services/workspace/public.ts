import type { Lookup, QueryResult } from "@server/lib/module-outcomes";
import { readLookup } from "@server/lib/module-outcomes";

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

export interface WorkspaceOwnership {
  id: string;
  ownerId: string;
  title: string;
}

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
