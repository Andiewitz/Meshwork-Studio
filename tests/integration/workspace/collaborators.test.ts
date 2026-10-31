import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createTeamWorkspaceAccess } from "@services/team/public";
const mocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  listWorkspaceCollaborators: vi.fn(),
  upsertWorkspaceCollaborator: vi.fn(),
  updateWorkspaceCollaboratorPermission: vi.fn(),
  removeWorkspaceCollaborator: vi.fn(),
  lookup: vi.fn(),
  profiles: vi.fn(),
}));
vi.mock("@services/workspace/db/storage", () => ({ workspaceStorage: mocks }));
vi.mock("@server/auth/internal-client", () => ({
  lookupCollaboratorIdentity: mocks.lookup,
  getCollaboratorProfiles: mocks.profiles,
}));
vi.mock("../../../server/auth", () => ({
  csrfProtect: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
import { registerWorkspaceRoutes } from "@services/workspace/routes/workspaceRoutes";
function app() {
  const a = express();
  a.use(express.json());
  registerWorkspaceRoutes(a, {
    isAuthenticated: (req, _res, next) => {
      req.user = { id: String(req.headers["x-test-user"]) } as typeof req.user;
      next();
    },
    directAccess: {
      getAccess: async () => ({ status: "available", value: "none" }),
    },
  });
  return a;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorkspace.mockResolvedValue({ id: "w", userId: "owner" });
  mocks.listWorkspaceCollaborators.mockResolvedValue([]);
});
describe("workspace collaborator management", () => {
  it("only the owner can add a verified identity", async () => {
    const a = app();
    const denied = await request(a)
      .post("/api/v1/workspaces/w/collaborators")
      .set("x-test-user", "stranger")
      .send({ email: "u@example.com", permission: "view" });
    expect(denied.status).toBe(403);
    expect(mocks.lookup).not.toHaveBeenCalled();
    mocks.lookup.mockResolvedValueOnce({ user: null });
    const unknown = await request(a)
      .post("/api/v1/workspaces/w/collaborators")
      .set("x-test-user", "owner")
      .send({ email: "u@example.com", permission: "view" });
    expect(unknown.status).toBe(400);
    expect(mocks.upsertWorkspaceCollaborator).not.toHaveBeenCalled();
    mocks.lookup.mockResolvedValueOnce({
      user: {
        id: "u",
        email: "u@example.com",
        name: "U",
        profileImageUrl: null,
      },
    });
    mocks.upsertWorkspaceCollaborator.mockResolvedValueOnce({
      userId: "u",
      permission: "view",
    });
    const added = await request(a)
      .post("/api/v1/workspaces/w/collaborators")
      .set("x-test-user", "owner")
      .send({ email: "u@example.com", permission: "view" });
    expect(added.status).toBe(201);
    expect(mocks.upsertWorkspaceCollaborator).toHaveBeenCalledWith({
      workspaceId: "w",
      userId: "u",
      permission: "view",
      addedBy: "owner",
    });
  });
  it("only the owner can change or remove collaborators", async () => {
    const a = app();
    mocks.listWorkspaceCollaborators.mockResolvedValue([
      { userId: "u", permission: "edit" },
    ]);
    mocks.updateWorkspaceCollaboratorPermission.mockResolvedValue({
      userId: "u",
      permission: "view",
    });
    expect(
      (
        await request(a)
          .patch("/api/v1/workspaces/w/collaborators/u")
          .set("x-test-user", "u")
          .send({ permission: "edit" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(a)
          .patch("/api/v1/workspaces/w/collaborators/u")
          .set("x-test-user", "owner")
          .send({ permission: "view" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(a)
          .delete("/api/v1/workspaces/w/collaborators/u")
          .set("x-test-user", "owner")
      ).status,
    ).toBe(204);
    expect(mocks.removeWorkspaceCollaborator).toHaveBeenCalledWith("w", "u");
  });
});
