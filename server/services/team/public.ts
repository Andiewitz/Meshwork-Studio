import type {
  Decision,
  Lookup,
  QueryResult,
} from "@server/lib/module-outcomes";
import type { WorkspaceRole } from "@shared/permissions";

export interface TeamWorkspaceAccess {
  checkAccess(userId: string, workspaceId: string): Promise<Decision>;
  lookupRole(
    workspaceId: string,
    userId: string,
  ): Promise<Lookup<WorkspaceRole>>;
}

export interface SharedWorkspaceReader {
  listIds(userId: string, requestId?: string): Promise<QueryResult<string[]>>;
}

/** Keep the existing access and role checks distinct until permission unification. */
export function createTeamWorkspaceAccess(source: {
  canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean>;
  getWorkspaceRole(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRole | null>;
}): TeamWorkspaceAccess {
  return {
    async checkAccess(userId, workspaceId) {
      try {
        return {
          status: (await source.canAccessWorkspace(userId, workspaceId))
            ? "allowed"
            : "denied",
        };
      } catch (cause) {
        return { status: "unavailable", cause };
      }
    },
    async lookupRole(workspaceId, userId) {
      try {
        const role = await source.getWorkspaceRole(workspaceId, userId);
        return role === null
          ? { status: "missing" }
          : { status: "found", value: role };
      } catch (cause) {
        return { status: "unavailable", cause };
      }
    },
  };
}
