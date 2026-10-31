import type { WorkspaceAccessReader } from "@services/workspace/public";
import { readQuery } from "@server/lib/module-outcomes";

/** Translate Workspace-owned permissions to the existing role contract. */
export function workspaceAccess(direct: WorkspaceAccessReader) {
  async function getWorkspaceRole(workspaceId: string, userId: string) {
    const access = readQuery(await direct.getAccess(workspaceId, userId));
    if (access === "owner") return "workspace-owner" as const;
    if (access === "edit") return "editor" as const;
    if (access === "view") return "viewer" as const;
    return null;
  }
  return {
    getWorkspaceRole,
    ...(direct.getAccessBatch
      ? {
          async canAccessMany(workspaceId: string, userIds: string[]) {
            const grants = readQuery(
              await direct.getAccessBatch!(workspaceId, userIds),
            );
            return new Set(
              grants
                .filter(
                  ({ access }) =>
                    access === "owner" ||
                    access === "edit" ||
                    access === "view",
                )
                .map(({ userId }) => userId),
            );
          },
        }
      : {}),
    async canAccessWorkspace(userId: string, workspaceId: string) {
      return (await getWorkspaceRole(workspaceId, userId)) !== null;
    },
  };
}
