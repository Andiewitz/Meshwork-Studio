import type { Express, RequestHandler, Request } from "express";
import { TeamJoinError, teamStorage } from "../db/storage";
import { joinTeamSchema, updateMemberRoleSchema } from "../db/schema";
import { csrfProtect } from "../../../auth";
import { z } from "zod";
import { createChildLogger } from "@server/lib/logger";
import { fail } from "@server/lib/errorEnvelope";
import { firstIssueMessage, zodIssues } from "@server/lib/validation";
import { logTraceback } from "@server/lib/traceback";
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
  app.post("/api/v1/teams", csrfProtect, isAuthenticated, async (req, res) => {
    try {
      const { name } = req.body as { name?: unknown };
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return fail(req, res, "VALIDATION_FAILED", "Team name is required", {
          status: 400,
        });
      }
      if (name.length > 64) {
        return fail(
          req,
          res,
          "VALIDATION_FAILED",
          "Team name must be 64 characters or less",
          { status: 400 },
        );
      }

      const userId = getUserId(req);
      const team = await teamStorage.createTeam(name.trim(), userId);
      res.status(201).json(team);
    } catch (err) {
      logTraceback(log, "Failed to create team", err, {
        userId: getUserId(req),
        requestId: req.requestId ?? "unscoped",
      });
      fail(
        req,
        res,
        "TEAM_UNAVAILABLE",
        "Team could not be created. Try again shortly.",
      );
    }
  });

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
      return fail(req, res, "FORBIDDEN", "Not a member of this team");

    const team = await teamStorage.getTeam(teamId);
    if (!team) return fail(req, res, "NOT_FOUND", "Team not found");

    const members = await teamStorage.getTeamMembers(teamId);
    res.json({ ...team, members });
  });

  // ── Join team via invite code ────────────────────────────────────
  app.post(
    "/api/v1/teams/join",
    csrfProtect,
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
          return fail(req, res, "VALIDATION_FAILED", firstIssueMessage(err), {
            issues: zodIssues(err),
          });
        }
        if (err instanceof TeamJoinError) {
          return fail(
            req,
            res,
            err.reason === "invalid_invite" ? "NOT_FOUND" : "CONFLICT",
            err.message,
            { status: err.reason === "invalid_invite" ? 404 : 409 },
          );
        }
        logTraceback(log, "Failed to join team", err, {
          userId: getUserId(req),
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "TEAM_UNAVAILABLE",
          "Team could not be joined. Try again shortly.",
        );
      }
    },
  );

  // ── Leave / remove member ────────────────────────────────────────
  app.delete(
    "/api/v1/teams/:id/members/:userId",
    csrfProtect,
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
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Only the team owner can remove other members",
          { status: 403 },
        );
      }

      if (isOwner && requesterId === targetUserId) {
        return fail(
          req,
          res,
          "CONFLICT",
          "Owner cannot leave. Delete the team instead.",
        );
      }

      await teamStorage.leaveTeam(teamId, targetUserId);
      res.status(204).send();
    },
  );

  // ── Share workspace with team ────────────────────────────────────
  app.post(
    "/api/v1/teams/:id/workspaces",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      try {
        const teamId = Array.isArray(req.params.id)
          ? req.params.id[0]
          : req.params.id;
        const userId = getUserId(req);
        const { workspaceId } = req.body as { workspaceId?: unknown };

        if (!workspaceId || typeof workspaceId !== "string") {
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            "workspaceId is required",
            {
              status: 400,
            },
          );
        }

        const isMember = await teamStorage.isTeamMember(teamId, userId);
        if (!isMember) return fail(req, res, "FORBIDDEN", "Not a member");

        const ws = await workspaceStorage.getWorkspace(workspaceId);
        if (ws?.userId !== userId) {
          return fail(
            req,
            res,
            "FORBIDDEN",
            "You can only share workspaces you own",
            { status: 403 },
          );
        }

        const tw = await teamStorage.shareWorkspace(teamId, workspaceId);
        res.status(201).json(tw);
      } catch (err) {
        logTraceback(log, "Failed to share workspace", err, {
          userId: getUserId(req),
          teamId: req.params.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "TEAM_UNAVAILABLE",
          "Workspace could not be shared. Try again shortly.",
        );
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
    if (!isMember) return fail(req, res, "FORBIDDEN", "Not a member");

    const workspaces = await teamStorage.getTeamWorkspaces(teamId);
    res.json(workspaces);
  });

  function getParam(req: Request, param = "id"): string {
    const val = req.params[param];
    return Array.isArray(val) ? val[0] : val || "";
  }

  // ── Unshare workspace ────────────────────────────────────────────
  app.delete(
    "/api/v1/teams/:id/workspaces/:workspaceId",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const teamId = getParam(req, "id");
      const workspaceId = getParam(req, "workspaceId");
      const userId = getUserId(req);

      const isMember = await teamStorage.isTeamMember(teamId, userId);
      if (!isMember) return fail(req, res, "FORBIDDEN", "Not a member");

      const ws = await workspaceStorage.getWorkspace(workspaceId);
      const isOwner = await teamStorage.isTeamOwner(teamId, userId);
      if (ws?.userId !== userId && !isOwner) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Only the workspace owner or team owner can unshare",
          { status: 403 },
        );
      }

      await teamStorage.unshareWorkspace(teamId, workspaceId);
      res.status(204).send();
    },
  );

  // ── Regenerate invite code (owner only) ──────────────────────────
  app.post(
    "/api/v1/teams/:id/regenerate-code",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const userId = getUserId(req);

      const isOwner = await teamStorage.isTeamOwner(teamId, userId);
      if (!isOwner)
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Only the owner can regenerate the invite code",
          { status: 403 },
        );

      const team = await teamStorage.regenerateInviteCode(teamId);
      res.json(team);
    },
  );

  // ── Delete team (owner only) ─────────────────────────────────────
  app.delete(
    "/api/v1/teams/:id",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const userId = getUserId(req);

      const isOwner = await teamStorage.isTeamOwner(teamId, userId);
      if (!isOwner)
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Only the owner can delete the team",
          { status: 403 },
        );

      await teamStorage.deleteTeam(teamId);
      res.status(204).send();
    },
  );

  // ── Update member role (owner/admin only) ────────────────────────
  app.patch(
    "/api/v1/teams/:id/members/:userId/role",
    csrfProtect,
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
          return fail(
            req,
            res,
            "FORBIDDEN",
            "Only owners and admins can change roles",
            { status: 403 },
          );
        }

        const targetRole = await teamStorage.getMemberRole(
          teamId,
          targetUserId,
        );
        if (targetRole === "owner") {
          return fail(req, res, "FORBIDDEN", "Cannot change the owner's role", {
            status: 403,
          });
        }

        if (actorRole === "admin" && newRole === "admin") {
          return fail(
            req,
            res,
            "FORBIDDEN",
            "Only the owner can promote to admin",
            { status: 403 },
          );
        }

        const updated = await teamStorage.updateMemberRole(
          teamId,
          targetUserId,
          newRole,
        );
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            firstIssueMessage(err, "Invalid role"),
            { issues: zodIssues(err) },
          );
        }
        logTraceback(log, "Failed to update member role", err, {
          userId: getUserId(req),
          teamId: req.params.id,
          targetUserId: req.params.userId,
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "TEAM_UNAVAILABLE",
          "Member role could not be updated. Try again shortly.",
        );
      }
    },
  );

  // ── Get user's role for a workspace ──────────────────────────────
  app.get("/api/v1/workspaces/:id/role", isAuthenticated, async (req, res) => {
    const workspaceId = getParam(req, "id");
    const userId = getUserId(req);

    if (!workspaceId)
      return fail(req, res, "VALIDATION_FAILED", "Invalid workspace ID", {
        status: 400,
      });

    const role = await teamStorage.getWorkspaceRole(workspaceId, userId);
    res.json({ role: role ?? "none" });
  });

  // ── Get all members for a workspace (via its team) ──────────────
  app.get(
    "/api/v1/workspaces/:id/members",
    isAuthenticated,
    async (req, res) => {
      const workspaceId = getParam(req, "id");
      const userId = getUserId(req);

      if (!workspaceId)
        return fail(req, res, "VALIDATION_FAILED", "Invalid workspace ID", {
          status: 400,
        });

      const hasAccess = await teamStorage.canAccessWorkspace(
        userId,
        workspaceId,
      );
      const ws = await workspaceStorage.getWorkspace(workspaceId);
      if (!hasAccess && ws?.userId !== userId) {
        return fail(req, res, "FORBIDDEN", "No access to this workspace", {
          status: 403,
        });
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
