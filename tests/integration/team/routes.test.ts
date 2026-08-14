import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { registerTeamRoutes } from "@server/modules/team/routes";

// ─── Mocks ───────────────────────────────────────────────────────────

const mockCreateTeam = vi.fn();
const mockGetTeamsByUser = vi.fn();
const mockGetTeam = vi.fn();
const mockGetTeamMembers = vi.fn();
const mockIsTeamMember = vi.fn();
const mockIsTeamOwner = vi.fn();
const mockJoinTeam = vi.fn();
const mockLeaveTeam = vi.fn();
const mockDeleteTeam = vi.fn();
const mockShareWorkspace = vi.fn();
const mockUnshareWorkspace = vi.fn();
const mockGetTeamWorkspaces = vi.fn();
const mockRegenerateInviteCode = vi.fn();
const mockCanAccessWorkspace = vi.fn();
const mockGetMemberRole = vi.fn();
const mockUpdateMemberRole = vi.fn();
const mockGetWorkspaceRole = vi.fn();

vi.mock("@services/team/db/storage", () => ({
  teamStorage: {
    createTeam: (...a: any[]) => mockCreateTeam(...a),
    getTeamsByUser: (...a: any[]) => mockGetTeamsByUser(...a),
    getTeam: (...a: any[]) => mockGetTeam(...a),
    getTeamMembers: (...a: any[]) => mockGetTeamMembers(...a),
    isTeamMember: (...a: any[]) => mockIsTeamMember(...a),
    isTeamOwner: (...a: any[]) => mockIsTeamOwner(...a),
    joinTeam: (...a: any[]) => mockJoinTeam(...a),
    leaveTeam: (...a: any[]) => mockLeaveTeam(...a),
    deleteTeam: (...a: any[]) => mockDeleteTeam(...a),
    shareWorkspace: (...a: any[]) => mockShareWorkspace(...a),
    unshareWorkspace: (...a: any[]) => mockUnshareWorkspace(...a),
    getTeamWorkspaces: (...a: any[]) => mockGetTeamWorkspaces(...a),
    regenerateInviteCode: (...a: any[]) => mockRegenerateInviteCode(...a),
    canAccessWorkspace: (...a: any[]) => mockCanAccessWorkspace(...a),
    getMemberRole: (...a: any[]) => mockGetMemberRole(...a),
    updateMemberRole: (...a: any[]) => mockUpdateMemberRole(...a),
    getWorkspaceRole: (...a: any[]) => mockGetWorkspaceRole(...a),
  },
  TeamDatabaseStorage: vi.fn(),
}));

const mockGetWorkspace = vi.fn();
vi.mock("@services/workspace/db/storage", () => ({
  workspaceStorage: {
    getWorkspace: (...a: any[]) => mockGetWorkspace(...a),
  },
  WorkspaceDatabaseStorage: vi.fn(),
}));

vi.mock("@server/modules/auth", () => ({
  AuthModule: {
    middleware: {
      isAuthenticated: (req: any, res: any, next: any) => {
        if (req.headers["x-test-user-id"]) {
          req.user = { id: req.headers["x-test-user-id"] };
          next();
        } else {
          res.status(401).json({ message: "Not authenticated" });
        }
      },
    },
  },
}));

vi.mock("@server/middleware/csrf", () => ({
  csrfProtection: (_req: any, _res: any, next: any) => next(),
}));

// ─── Setup ───────────────────────────────────────────────────────────

const setupApp = () => {
  const app = express();
  app.use(express.json());

  const mockContext = {
    registry: {
      get: (key: string) => {
        if (key === "isAuthenticated") {
          return (req: any, res: any, next: any) => {
            if (req.headers["x-test-user-id"]) {
              req.user = { id: req.headers["x-test-user-id"] };
              next();
            } else {
              res.status(401).json({ message: "Not authenticated" });
            }
          };
        }
        if (key === "workspaceStorage") {
          return {
            getWorkspace: mockGetWorkspace,
          };
        }
        return null;
      },
    },
    eventBus: {
      emit: vi.fn(),
      emitAsync: vi.fn(),
    },
  } as any;

  registerTeamRoutes(app, mockContext);
  return app;
};

describe("Team Routes - Full Coverage", () => {
  let app: express.Express;

  beforeEach(() => {
    app = setupApp();
    vi.clearAllMocks();
  });

  // ─── Auth Guard ──────────────────────────────────────────────────

  describe("Authentication", () => {
    it("rejects unauthenticated requests on all mutation endpoints", async () => {
      const endpoints = [
        { method: "post", path: "/api/v1/teams", body: { name: "x" } },
        {
          method: "post",
          path: "/api/v1/teams/join",
          body: { inviteCode: "MX-1234" },
        },
        { method: "delete", path: "/api/v1/teams/t1/members/u1", body: {} },
        {
          method: "post",
          path: "/api/v1/teams/t1/workspaces",
          body: { workspaceId: 1 },
        },
        { method: "delete", path: "/api/v1/teams/t1/workspaces/1", body: {} },
        { method: "delete", path: "/api/v1/teams/t1", body: {} },
      ];

      for (const ep of endpoints) {
        const res = await (request(app) as any)
          [ep.method](ep.path)
          .send(ep.body);
        expect(res.status).toBe(401);
      }
    });
  });

  // ─── Create Team ─────────────────────────────────────────────────

  describe("POST /api/teams", () => {
    it("creates a team with valid name", async () => {
      mockCreateTeam.mockResolvedValue({
        id: "t1",
        name: "Alpha",
        ownerId: "u1",
        inviteCode: "MX-AAAA",
      });
      const res = await request(app)
        .post("/api/v1/teams")
        .set("x-test-user-id", "u1")
        .send({ name: "Alpha" });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Alpha");
      expect(mockCreateTeam).toHaveBeenCalledWith("Alpha", "u1");
    });

    it("rejects empty name", async () => {
      const res = await request(app)
        .post("/api/v1/teams")
        .set("x-test-user-id", "u1")
        .send({ name: "" });
      expect(res.status).toBe(400);
    });

    it("rejects whitespace-only name", async () => {
      const res = await request(app)
        .post("/api/v1/teams")
        .set("x-test-user-id", "u1")
        .send({ name: "   " });
      expect(res.status).toBe(400);
    });

    it("rejects name over 64 chars", async () => {
      const res = await request(app)
        .post("/api/v1/teams")
        .set("x-test-user-id", "u1")
        .send({ name: "x".repeat(65) });
      expect(res.status).toBe(400);
    });

    it("trims whitespace from name", async () => {
      mockCreateTeam.mockResolvedValue({
        id: "t1",
        name: "Alpha",
        ownerId: "u1",
      });
      await request(app)
        .post("/api/v1/teams")
        .set("x-test-user-id", "u1")
        .send({ name: "  Alpha  " });
      expect(mockCreateTeam).toHaveBeenCalledWith("Alpha", "u1");
    });
  });

  // ─── Join Team ───────────────────────────────────────────────────

  describe("POST /api/teams/join", () => {
    it("joins with valid invite code", async () => {
      mockJoinTeam.mockResolvedValue({ teamId: "t1", userId: "u2" });
      const res = await request(app)
        .post("/api/v1/teams/join")
        .set("x-test-user-id", "u2")
        .send({ inviteCode: "MX-1234" });
      expect(res.status).toBe(201);
      expect(mockJoinTeam).toHaveBeenCalledWith("MX-1234", "u2");
    });

    it("uppercases the invite code", async () => {
      mockJoinTeam.mockResolvedValue({ teamId: "t1", userId: "u2" });
      await request(app)
        .post("/api/v1/teams/join")
        .set("x-test-user-id", "u2")
        .send({ inviteCode: "mx-abcd" });
      expect(mockJoinTeam).toHaveBeenCalledWith("MX-ABCD", "u2");
    });

    it("rejects empty invite code", async () => {
      const res = await request(app)
        .post("/api/v1/teams/join")
        .set("x-test-user-id", "u2")
        .send({ inviteCode: "" });
      expect(res.status).toBe(400);
    });
  });

  // ─── Leave / Remove Member ───────────────────────────────────────

  describe("DELETE /api/teams/:id/members/:userId", () => {
    it("allows a user to leave their own team", async () => {
      mockIsTeamOwner.mockResolvedValue(false);
      mockLeaveTeam.mockResolvedValue(undefined);
      const res = await request(app)
        .delete("/api/v1/teams/t1/members/u2")
        .set("x-test-user-id", "u2");
      expect(res.status).toBe(204);
      expect(mockLeaveTeam).toHaveBeenCalledWith("t1", "u2");
    });

    it("allows owner to remove another member", async () => {
      mockIsTeamOwner.mockResolvedValue(true);
      mockLeaveTeam.mockResolvedValue(undefined);
      const res = await request(app)
        .delete("/api/v1/teams/t1/members/u2")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(204);
    });

    it("blocks non-owner from removing another member (IDOR)", async () => {
      mockIsTeamOwner.mockResolvedValue(false);
      const res = await request(app)
        .delete("/api/v1/teams/t1/members/u3")
        .set("x-test-user-id", "u2");
      expect(res.status).toBe(403);
      expect(mockLeaveTeam).not.toHaveBeenCalled();
    });

    it("blocks owner from leaving (must delete team instead)", async () => {
      mockIsTeamOwner.mockResolvedValue(true);
      const res = await request(app)
        .delete("/api/v1/teams/t1/members/u1")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(400);
      expect(mockLeaveTeam).not.toHaveBeenCalled();
    });
  });

  // ─── Share Workspace ─────────────────────────────────────────────

  describe("POST /api/teams/:id/workspaces", () => {
    it("shares workspace if user is member AND workspace owner", async () => {
      mockIsTeamMember.mockResolvedValue(true);
      mockGetWorkspace.mockResolvedValue({ id: 1, userId: "u1" });
      mockShareWorkspace.mockResolvedValue({ teamId: "t1", workspaceId: 1 });

      const res = await request(app)
        .post("/api/v1/teams/t1/workspaces")
        .set("x-test-user-id", "u1")
        .send({ workspaceId: 1 });
      expect(res.status).toBe(201);
    });

    it("blocks sharing if not a team member", async () => {
      mockIsTeamMember.mockResolvedValue(false);
      const res = await request(app)
        .post("/api/v1/teams/t1/workspaces")
        .set("x-test-user-id", "hacker")
        .send({ workspaceId: 1 });
      expect(res.status).toBe(403);
    });

    it("blocks sharing workspace you do not own (IDOR)", async () => {
      mockIsTeamMember.mockResolvedValue(true);
      mockGetWorkspace.mockResolvedValue({ id: 1, userId: "someone_else" });
      const res = await request(app)
        .post("/api/v1/teams/t1/workspaces")
        .set("x-test-user-id", "u1")
        .send({ workspaceId: 1 });
      expect(res.status).toBe(403);
      expect(mockShareWorkspace).not.toHaveBeenCalled();
    });

    it("rejects missing workspaceId", async () => {
      mockIsTeamMember.mockResolvedValue(true);
      const res = await request(app)
        .post("/api/v1/teams/t1/workspaces")
        .set("x-test-user-id", "u1")
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ─── Unshare Workspace ───────────────────────────────────────────

  describe("DELETE /api/teams/:id/workspaces/:workspaceId", () => {
    it("allows workspace owner to unshare", async () => {
      mockIsTeamMember.mockResolvedValue(true);
      mockGetWorkspace.mockResolvedValue({ id: 1, userId: "u1" });
      mockIsTeamOwner.mockResolvedValue(false);
      mockUnshareWorkspace.mockResolvedValue(undefined);

      const res = await request(app)
        .delete("/api/v1/teams/t1/workspaces/1")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(204);
    });

    it("allows team owner to unshare any workspace", async () => {
      mockIsTeamMember.mockResolvedValue(true);
      mockGetWorkspace.mockResolvedValue({ id: 1, userId: "u2" });
      mockIsTeamOwner.mockResolvedValue(true);
      mockUnshareWorkspace.mockResolvedValue(undefined);

      const res = await request(app)
        .delete("/api/v1/teams/t1/workspaces/1")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(204);
    });

    it("blocks non-owner member from unsharing others workspace (IDOR)", async () => {
      mockIsTeamMember.mockResolvedValue(true);
      mockGetWorkspace.mockResolvedValue({ id: 1, userId: "u2" }); // not our workspace
      mockIsTeamOwner.mockResolvedValue(false); // not team owner either
      const res = await request(app)
        .delete("/api/v1/teams/t1/workspaces/1")
        .set("x-test-user-id", "u3");
      expect(res.status).toBe(403);
    });
  });

  // ─── Regenerate Invite Code ──────────────────────────────────────

  describe("POST /api/teams/:id/regenerate-code", () => {
    it("allows owner to regenerate", async () => {
      mockIsTeamOwner.mockResolvedValue(true);
      mockRegenerateInviteCode.mockResolvedValue({
        id: "t1",
        inviteCode: "MX-NEW1",
      });
      const res = await request(app)
        .post("/api/v1/teams/t1/regenerate-code")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(200);
      expect(res.body.inviteCode).toBe("MX-NEW1");
    });

    it("blocks non-owner from regenerating", async () => {
      mockIsTeamOwner.mockResolvedValue(false);
      const res = await request(app)
        .post("/api/v1/teams/t1/regenerate-code")
        .set("x-test-user-id", "u2");
      expect(res.status).toBe(403);
    });
  });

  // ─── Delete Team ─────────────────────────────────────────────────

  describe("DELETE /api/teams/:id", () => {
    it("allows owner to delete", async () => {
      mockIsTeamOwner.mockResolvedValue(true);
      mockDeleteTeam.mockResolvedValue(undefined);
      const res = await request(app)
        .delete("/api/v1/teams/t1")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(204);
    });

    it("blocks non-owner from deleting", async () => {
      mockIsTeamOwner.mockResolvedValue(false);
      const res = await request(app)
        .delete("/api/v1/teams/t1")
        .set("x-test-user-id", "u2");
      expect(res.status).toBe(403);
      expect(mockDeleteTeam).not.toHaveBeenCalled();
    });
  });

  // ─── Team Workspaces List ────────────────────────────────────────

  describe("GET /api/teams/:id/workspaces", () => {
    it("returns workspaces for a team member", async () => {
      mockIsTeamMember.mockResolvedValue(true);
      mockGetTeamWorkspaces.mockResolvedValue([{ id: 1, title: "Project A" }]);
      const res = await request(app)
        .get("/api/v1/teams/t1/workspaces")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("blocks non-member from listing workspaces", async () => {
      mockIsTeamMember.mockResolvedValue(false);
      const res = await request(app)
        .get("/api/v1/teams/t1/workspaces")
        .set("x-test-user-id", "hacker");
      expect(res.status).toBe(403);
    });
  });

  // ─── Role Management ────────────────────────────────────────────

  describe("PATCH /api/teams/:id/members/:userId/role", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u2/role")
        .send({ role: "editor" });
      expect(res.status).toBe(401);
    });

    it("allows owner to change a member role to editor", async () => {
      mockGetMemberRole.mockResolvedValueOnce("owner"); // actor
      mockGetMemberRole.mockResolvedValueOnce("viewer"); // target
      mockUpdateMemberRole.mockResolvedValue({
        id: "m1",
        teamId: "t1",
        userId: "u2",
        role: "editor",
      });
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u2/role")
        .set("x-test-user-id", "u1")
        .send({ role: "editor" });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("editor");
    });

    it("allows owner to promote member to admin", async () => {
      mockGetMemberRole.mockResolvedValueOnce("owner"); // actor
      mockGetMemberRole.mockResolvedValueOnce("editor"); // target
      mockUpdateMemberRole.mockResolvedValue({
        id: "m1",
        teamId: "t1",
        userId: "u2",
        role: "admin",
      });
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u2/role")
        .set("x-test-user-id", "u1")
        .send({ role: "admin" });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("admin");
    });

    it("blocks admin from promoting to admin (only owner can)", async () => {
      mockGetMemberRole.mockResolvedValueOnce("admin"); // actor is admin
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u3/role")
        .set("x-test-user-id", "u2")
        .send({ role: "admin" });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/owner/);
    });

    it("allows admin to change member role to viewer", async () => {
      mockGetMemberRole.mockResolvedValueOnce("admin"); // actor
      mockGetMemberRole.mockResolvedValueOnce("editor"); // target
      mockUpdateMemberRole.mockResolvedValue({
        id: "m1",
        teamId: "t1",
        userId: "u3",
        role: "viewer",
      });
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u3/role")
        .set("x-test-user-id", "u2")
        .send({ role: "viewer" });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("viewer");
    });

    it("blocks editor from changing roles", async () => {
      mockGetMemberRole.mockResolvedValueOnce("editor"); // actor
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u3/role")
        .set("x-test-user-id", "u2")
        .send({ role: "viewer" });
      expect(res.status).toBe(403);
    });

    it("blocks viewer from changing roles", async () => {
      mockGetMemberRole.mockResolvedValueOnce("viewer"); // actor
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u3/role")
        .set("x-test-user-id", "u2")
        .send({ role: "editor" });
      expect(res.status).toBe(403);
    });

    it("blocks changing the owner role", async () => {
      mockGetMemberRole.mockResolvedValueOnce("admin"); // actor
      mockGetMemberRole.mockResolvedValueOnce("owner"); // target is owner
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u1/role")
        .set("x-test-user-id", "u2")
        .send({ role: "editor" });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/owner/);
    });

    it("rejects invalid role values", async () => {
      mockGetMemberRole.mockResolvedValueOnce("owner");
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u2/role")
        .set("x-test-user-id", "u1")
        .send({ role: "superadmin" });
      expect(res.status).toBe(400);
    });

    it("rejects setting role to owner via API", async () => {
      mockGetMemberRole.mockResolvedValueOnce("owner");
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u2/role")
        .set("x-test-user-id", "u1")
        .send({ role: "owner" });
      expect(res.status).toBe(400);
    });

    it("blocks non-member from changing roles", async () => {
      mockGetMemberRole.mockResolvedValueOnce(null); // not a member
      const res = await request(app)
        .patch("/api/v1/teams/t1/members/u2/role")
        .set("x-test-user-id", "hacker")
        .send({ role: "viewer" });
      expect(res.status).toBe(403);
    });
  });

  // ─── Workspace Role ─────────────────────────────────────────────

  describe("GET /api/workspaces/:id/role", () => {
    it("returns workspace-owner for the workspace creator", async () => {
      mockGetWorkspaceRole.mockResolvedValue("workspace-owner");
      const res = await request(app)
        .get("/api/v1/workspaces/1/role")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("workspace-owner");
    });

    it("returns editor for a team editor", async () => {
      mockGetWorkspaceRole.mockResolvedValue("editor");
      const res = await request(app)
        .get("/api/v1/workspaces/1/role")
        .set("x-test-user-id", "u2");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("editor");
    });

    it("returns none for a non-member", async () => {
      mockGetWorkspaceRole.mockResolvedValue(null);
      const res = await request(app)
        .get("/api/v1/workspaces/1/role")
        .set("x-test-user-id", "hacker");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("none");
    });

    it("rejects invalid workspace ID", async () => {
      const res = await request(app)
        .get("/api/v1/workspaces/abc/role")
        .set("x-test-user-id", "u1");
      expect(res.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get("/api/v1/workspaces/1/role");
      expect(res.status).toBe(401);
    });
  });
});
