import type { TeamWorkspaceAccess } from "@services/team/public";
import { readDecision, readLookup } from "@server/lib/module-outcomes";

/** Bridge explicit internal outcomes to existing route error handling. */
export function workspaceAccess(team: TeamWorkspaceAccess) {
  return {
    async canAccessWorkspace(userId: string, workspaceId: string) {
      return readDecision(await team.checkAccess(userId, workspaceId));
    },
    async getWorkspaceRole(workspaceId: string, userId: string) {
      return readLookup(await team.lookupRole(workspaceId, userId)) ?? null;
    },
  };
}
