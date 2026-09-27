import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceInMemoryStorage } from "@services/workspace/db/storage";

describe("Workspace collaborator storage (Unit)", () => {
  let storage: WorkspaceInMemoryStorage;
  let workspaceId: string;

  beforeEach(async () => {
    storage = new WorkspaceInMemoryStorage();
    const workspace = await storage.createWorkspace({
      title: "System map",
      userId: "owner-1",
      groups: [],
      tags: [],
    });
    workspaceId = workspace.id;
  });

  it("returns owner, collaborator, and no-access states", async () => {
    await storage.upsertWorkspaceCollaborator({
      workspaceId,
      userId: "viewer-1",
      permission: "view",
      addedBy: "owner-1",
    });
    await storage.upsertWorkspaceCollaborator({
      workspaceId,
      userId: "editor-1",
      permission: "edit",
      addedBy: "owner-1",
    });

    await expect(
      storage.getWorkspaceAccess(workspaceId, "owner-1"),
    ).resolves.toBe("owner");
    await expect(
      storage.getWorkspaceAccess(workspaceId, "viewer-1"),
    ).resolves.toBe("view");
    await expect(
      storage.getWorkspaceAccess(workspaceId, "editor-1"),
    ).resolves.toBe("edit");
    await expect(
      storage.getWorkspaceAccess(workspaceId, "stranger-1"),
    ).resolves.toBe("none");
    await expect(
      storage.getWorkspaceAccess("missing-workspace", "owner-1"),
    ).resolves.toBe("none");
  });

  it("upserts a grant without creating duplicates", async () => {
    await storage.upsertWorkspaceCollaborator({
      workspaceId,
      userId: "user-2",
      permission: "view",
      addedBy: "owner-1",
    });
    await storage.upsertWorkspaceCollaborator({
      workspaceId,
      userId: "user-2",
      permission: "edit",
      addedBy: "other-owner",
    });

    await expect(
      storage.listWorkspaceCollaborators(workspaceId),
    ).resolves.toEqual([
      expect.objectContaining({
        userId: "user-2",
        permission: "edit",
        addedBy: "owner-1",
      }),
    ]);
  });

  it("updates and removes a collaborator", async () => {
    await storage.upsertWorkspaceCollaborator({
      workspaceId,
      userId: "user-2",
      permission: "view",
      addedBy: "owner-1",
    });

    await expect(
      storage.updateWorkspaceCollaboratorPermission(
        workspaceId,
        "user-2",
        "edit",
      ),
    ).resolves.toEqual(
      expect.objectContaining({ userId: "user-2", permission: "edit" }),
    );

    await storage.removeWorkspaceCollaborator(workspaceId, "user-2");
    await expect(
      storage.getWorkspaceAccess(workspaceId, "user-2"),
    ).resolves.toBe("none");
  });

  it("rejects an owner collaborator grant and mutations", async () => {
    await expect(
      storage.upsertWorkspaceCollaborator({
        workspaceId,
        userId: "owner-1",
        permission: "edit",
        addedBy: "owner-1",
      }),
    ).rejects.toThrow("Workspace owner cannot be a collaborator");

    await expect(
      storage.updateWorkspaceCollaboratorPermission(
        workspaceId,
        "owner-1",
        "view",
      ),
    ).rejects.toThrow("Workspace owner cannot be a collaborator");
  });

  it("rejects collaborators for a workspace that does not exist", async () => {
    await expect(
      storage.upsertWorkspaceCollaborator({
        workspaceId: "missing-workspace",
        userId: "user-2",
        permission: "view",
        addedBy: "owner-1",
      }),
    ).rejects.toThrow("Workspace not found");
  });

  it("removes collaborator rows when the workspace is deleted", async () => {
    await storage.upsertWorkspaceCollaborator({
      workspaceId,
      userId: "user-2",
      permission: "view",
      addedBy: "owner-1",
    });

    await storage.deleteWorkspace(workspaceId);

    await expect(
      storage.listWorkspaceCollaborators(workspaceId),
    ).resolves.toEqual([]);
  });

  it("removes a deleted user's grants from workspaces they do not own", async () => {
    const otherWorkspace = await storage.createWorkspace({
      title: "Other map",
      userId: "other-owner",
      groups: [],
      tags: [],
    });
    await storage.upsertWorkspaceCollaborator({
      workspaceId: otherWorkspace.id,
      userId: "owner-1",
      permission: "edit",
      addedBy: "other-owner",
    });

    await storage.deleteAllUserData("owner-1");

    await expect(
      storage.listWorkspaceCollaborators(otherWorkspace.id),
    ).resolves.toEqual([]);
  });
});
