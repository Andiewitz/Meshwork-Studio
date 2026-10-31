/** Compile-time assertions, checked by `npm run check`; never invoked. */
import type { CanvasRouteDependencies } from "@services/canvas/dependencies";
import type { WorkspaceRouteDependencies } from "@services/workspace/dependencies";
import type { TeamRouteDependencies } from "@services/team/dependencies";
import type { CanvasDocuments } from "@services/canvas/copy-workspace";

export function checkModuleCapabilities(
  canvas: CanvasRouteDependencies,
  workspace: WorkspaceRouteDependencies,
  team: TeamRouteDependencies,
  documents: CanvasDocuments,
) {
  // @ts-expect-error Workspace is exposed as a summary reader, not a repository.
  canvas.workspaces.deleteAllUserData("user");
  // @ts-expect-error Team grants cannot be mutated through this capability.
  workspace.directAccess.shareWorkspace("team", "workspace");
  // @ts-expect-error Team cannot update a foreign workspace.
  team.workspaces.updateWorkspace("workspace", {});
  // @ts-expect-error Canvas document copying does not grant bulk deletion.
  documents.deleteWorkspaces(["workspace"]);
  // @ts-expect-error Required dependencies must be wired explicitly.
  const missing: CanvasRouteDependencies = {
    isAuthenticated: canvas.isAuthenticated,
  };
  const wrong: WorkspaceRouteDependencies = {
    isAuthenticated: workspace.isAuthenticated,
    // @ts-expect-error A boolean lookup cannot hide dependency outages.
    directAccess: { getAccess: async () => true },
  };
  const swapped: TeamRouteDependencies = {
    isAuthenticated: team.isAuthenticated,
    // @ts-expect-error A different domain's port is not a valid adapter.
    workspaces: workspace.directAccess,
    directAccess: team.directAccess,
  };
  return { missing, wrong, swapped };
}
