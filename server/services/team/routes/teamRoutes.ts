import type { Express, RequestHandler, Request } from "express";
import { teamStorage } from "../db/storage";
import { joinTeamSchema, updateMemberRoleSchema } from "../db/schema";
import { csrfProtection } from "@server/middleware/csrf";
import { z } from "zod";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";
import type { IWorkspaceStorage } from "@services/workspace/db/storage";

const log = createChildLogger("team-routes");

function getUserId(req: Request): string {
  if (!req.user?.id) {
    throw new Error("User not authenticated");
  }
  return req.user.id;
}

export function registerTeamRoutes(app: Express, context: AppContext) {
  const isAuthenticated =
    context.registry.get<RequestHandler>("isAuthenticated");
  const workspaceStorage =
    context.registry.get<IWorkspaceStorage>("workspaceStorage");

  // ── Create a team ────────────────────────────────────────────────
  app.post(
    "/api/v1/teams",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      try {
        const { name } = req.body as { name?: unknown };
        if (!name || typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ message: "Team name is required" });
        }
        if (name.length > 64) {
          return res
            .status(400)
            .json({ message: "Team name must be 64 characters or less" });
        }

        const userId = getUserId(req);
        const team = await teamStorage.createTeam(name.trim(), userId);
        res.status(201).json(team);
      } catch (err) {
        log.error({ err, userId: getUserId(req) }, "Failed to create team");
        res.status(400).json({ message: "Failed to create team" });
      }
    },
  );

  // ── List user's teams ────────────────────────────────────────────
  app.get("/api/v1/teams", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const teams = await teamStorage.getTeamsByUser(userId);
    res.json(teams);
  });

  // ── Get team details + members ───────────────────────────────────
  app.get("/api/v1/teams/:id", isAuthenticated, async (req, res) => {
    const teamId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const userId = getUserId(req);

    const isMember = await teamStorage.isTeamMember(teamId, userId);
    if (!isMember)
      return res.status(403).json({ message: "Not a member of this team" });

    const team = await teamStorage.getTeam(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const members = await teamStorage.getTeamMembers(teamId);
    res.json({ ...team, members });
  });

  // ── Join team via invite code ────────────────────────────────────
  app.post(
    "/api/v1/teams/join",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      try {
        const { inviteCode } = joinTeamSchema.parse(req.body);
        const userId = getUserId(req);
        const result = await teamStorage.joinTeam(
          inviteCode.toUpperCase(),
          userId,
        );
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: err.errors[0].message });
        }
        log.error({ err, userId: getUserId(req) }, "Failed to join team");
        res.status(400).json({ message: "Failed to join team" });
      }
    },
  );

  // ── Leave / remove member ────────────────────────────────────────
  app.delete(
    "/api/v1/teams/:id/members/:userId",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const targetUserId = Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId;
      const requesterId = getUserId(req);

      const isOwner = await teamStorage.isTeamOwner(teamId, requesterId);
      if (requesterId !== targetUserId && !isOwner) {
        return res
          .status(403)
          .json({ message: "Only the team owner can remove other members" });
      }

      if (isOwner && requesterId === targetUserId) {
        return res
          .status(400)
          .json({ message: "Owner cannot leave. Delete the team instead." });
      }

      await teamStorage.leaveTeam(teamId, targetUserId);
      res.status(204).send();
    },
  );

  // ── Share workspace with team ────────────────────────────────────
  app.post(
    "/api/v1/teams/:id/workspaces",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      try {
        const teamId = Array.isArray(req.params.id)
          ? req.params.id[0]
          : req.params.id;
        const userId = getUserId(req);
        const { workspaceId } = req.body as { workspaceId?: unknown };

        if (!workspaceId || typeof workspaceId !== "number") {
          return res.status(400).json({ message: "workspaceId is required" });
        }

        const isMember = await teamStorage.isTeamMember(teamId, userId);
        if (!isMember) return res.status(403).json({ message: "Not a member" });

        const ws = await workspaceStorage.getWorkspace(workspaceId);
        if (ws?.userId !== userId) {
          return res
            .status(403)
            .json({ message: "You can only share workspaces you own" });
        }

        const tw = await teamStorage.shareWorkspace(teamId, workspaceId);
        res.status(201).json(tw);
      } catch (err) {
        log.error(
          { err, userId: getUserId(req), teamId: req.params.id },
          "Failed to share workspace",
        );
        res.status(400).json({ message: "Failed to share workspace" });
      }
    },
  );

  // ── List team workspaces ─────────────────────────────────────────
  app.get("/api/v1/teams/:id/workspaces", isAuthenticated, async (req, res) => {
    const teamId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const userId = getUserId(req);

    const isMember = await teamStorage.isTeamMember(teamId, userId);
    if (!isMember) return res.status(403).json({ message: "Not a member" });

    const workspaces = await teamStorage.getTeamWorkspaces(teamId);
    res.json(workspaces);
  });

  // ── Unshare workspace ────────────────────────────────────────────
  app.delete(
    "/api/v1/teams/:id/workspaces/:workspaceId",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const workspaceId = Number(req.params.workspaceId);
      const userId = getUserId(req);

      const isMember = await teamStorage.isTeamMember(teamId, userId);
      if (!isMember) return res.status(403).json({ message: "Not a member" });

      const ws = await workspaceStorage.getWorkspace(workspaceId);
      const isOwner = await teamStorage.isTeamOwner(teamId, userId);
      if (ws?.userId !== userId && !isOwner) {
        return res.status(403).json({
          message: "Only the workspace owner or team owner can unshare",
        });
      }

      await teamStorage.unshareWorkspace(teamId, workspaceId);
      res.status(204).send();
    },
  );

  // ── Regenerate invite code (owner only) ──────────────────────────
  app.post(
    "/api/v1/teams/:id/regenerate-code",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const userId = getUserId(req);

      const isOwner = await teamStorage.isTeamOwner(teamId, userId);
      if (!isOwner)
        return res
          .status(403)
          .json({ message: "Only the owner can regenerate the invite code" });

      const team = await teamStorage.regenerateInviteCode(teamId);
      res.json(team);
    },
  );

  // ── Delete team (owner only) ─────────────────────────────────────
  app.delete(
    "/api/v1/teams/:id",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const userId = getUserId(req);

      const isOwner = await teamStorage.isTeamOwner(teamId, userId);
      if (!isOwner)
        return res
          .status(403)
          .json({ message: "Only the owner can delete the team" });

      await teamStorage.deleteTeam(teamId);
      res.status(204).send();
    },
  );

  // ── Update member role (owner/admin only) ────────────────────────
  app.patch(
    "/api/v1/teams/:id/members/:userId/role",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const targetUserId = Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId;
      const actorId = getUserId(req);

      try {
        const { role: newRole } = updateMemberRoleSchema.parse(req.body);

        const actorRole = await teamStorage.getMemberRole(teamId, actorId);
        if (!actorRole || (actorRole !== "owner" && actorRole !== "admin")) {
          return res
            .status(403)
            .json({ message: "Only owners and admins can change roles" });
        }

        const targetRole = await teamStorage.getMemberRole(
          teamId,
          targetUserId,
        );
        if (targetRole === "owner") {
          return res
            .status(403)
            .json({ message: "Cannot change the owner's role" });
        }

        if (actorRole === "admin" && newRole === "admin") {
          return res
            .status(403)
            .json({ message: "Only the owner can promote to admin" });
        }

        const updated = await teamStorage.updateMemberRole(
          teamId,
          targetUserId,
          newRole,
        );
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: err.errors[0]?.message || "Invalid role" });
        }
        log.error(
          {
            err,
            userId: getUserId(req),
            teamId: req.params.id,
            targetUserId: req.params.userId,
          },
          "Failed to update member role",
        );
        res.status(400).json({ message: "Failed to update role" });
      }
    },
  );

  // ── Get user's role for a workspace ──────────────────────────────
  app.get("/api/v1/workspaces/:id/role", isAuthenticated, async (req, res) => {
    const workspaceId = Number(req.params.id);
    const userId = getUserId(req);

    if (isNaN(workspaceId))
      return res.status(400).json({ message: "Invalid workspace ID" });

    const role = await teamStorage.getWorkspaceRole(workspaceId, userId);
    res.json({ role: role ?? "none" });
  });

  // ── Get all members for a workspace (via its team) ──────────────
  app.get(
    "/api/v1/workspaces/:id/members",
    isAuthenticated,
    async (req, res) => {
      const workspaceId = Number(req.params.id);
      const userId = getUserId(req);

      if (isNaN(workspaceId))
        return res.status(400).json({ message: "Invalid workspace ID" });

      const hasAccess = await teamStorage.canAccessWorkspace(
        userId,
        workspaceId,
      );
      const ws = await workspaceStorage.getWorkspace(workspaceId);
      if (!hasAccess && ws?.userId !== userId) {
        return res.status(403).json({ message: "No access to this workspace" });
      }

      const teams = await teamStorage.getTeamsForWorkspace(workspaceId);
      if (teams.length === 0) {
        return res.json({ teamId: null, members: [] });
      }

      const team = teams[0];
      const members = await teamStorage.getTeamMembers(team.id);
      res.json({ teamId: team.id, members });
    },
  );
}
