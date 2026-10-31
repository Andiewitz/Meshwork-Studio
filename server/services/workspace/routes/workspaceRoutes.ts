import type { Express, Request } from "express";
import { workspaceStorage } from "../db/storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { csrfProtect } from "../../../auth";
import { createChildLogger } from "@server/lib/logger";
import { fail } from "@server/lib/errorEnvelope";
import { firstIssueMessage, zodIssues } from "@server/lib/validation";
import { logTraceback } from "@server/lib/traceback";
import type { WorkspaceRouteDependencies } from "../dependencies";
import { workspaceAccess } from "@server/lib/workspace-access";
import { canEditWorkspace, canDeleteWorkspace } from "@server/lib/permissions";
import { workspaceOutbox } from "../outbox-service";
import {
  lookupCollaboratorIdentity,
  getCollaboratorProfiles,
} from "@server/auth/internal-client";

const log = createChildLogger("workspace-routes");

function getUserId(req: Request): string {
  if (!req.user?.id) {
    throw new Error("User not authenticated");
  }
  return req.user.id;
}

function isWorkspaceOwner(
  workspace: { userId: string | null },
  userId: string,
) {
  return workspace.userId === userId;
}

export function registerWorkspaceRoutes(
  app: Express,
  context: WorkspaceRouteDependencies,
) {
  const { isAuthenticated } = context;
  const access = workspaceAccess(context.directAccess);
  // Collections (Subcollections)
  app.get("/api/v1/collections", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const parentId = req.query.parentId ? Number(req.query.parentId) : null;
    const collections = await workspaceStorage.getCollections(userId, parentId);
    res.json(collections);
  });

  app.post(
    "/api/v1/collections",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      try {
        const userId = getUserId(req);
        const collection = await workspaceStorage.createCollection({
          ...(req.body as {
            title: string;
            description?: string | null;
            parentId?: number | null;
          }),
          userId,
        });
        res.status(201).json(collection);
      } catch (err) {
        logTraceback(log, "Failed to create collection", err, {
          userId: getUserId(req),
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "WORKSPACE_UNAVAILABLE", "Failed to create collection");
      }
    },
  );

  app.get("/api/v1/collections/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    const collection = await workspaceStorage.getCollectionById(id);
    if (!collection) return fail(req, res, "NOT_FOUND", "Collection not found");

    const userId = getUserId(req);
    if (collection.userId !== userId)
      return fail(
        req,
        res,
        "FORBIDDEN",
        "You do not have access to this collection",
      );

    res.json(collection);
  });

  app.put(
    "/api/v1/collections/:id",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const id = Number(req.params.id);
      const existing = await workspaceStorage.getCollectionById(id);
      if (!existing) return fail(req, res, "NOT_FOUND", "Collection not found");

      const userId = getUserId(req);
      if (existing.userId !== userId)
        return fail(
          req,
          res,
          "FORBIDDEN",
          "You do not have access to this collection",
        );

      const updated = await workspaceStorage.updateCollection(
        id,
        req.body as Partial<{
          title: string;
          description?: string | null;
          parentId?: number | null;
        }>,
      );
      res.json(updated);
    },
  );

  app.delete(
    "/api/v1/collections/:id",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const id = Number(req.params.id);
      const existing = await workspaceStorage.getCollectionById(id);
      if (!existing) return fail(req, res, "NOT_FOUND", "Collection not found");

      const userId = getUserId(req);
      if (existing.userId !== userId)
        return fail(
          req,
          res,
          "FORBIDDEN",
          "You do not have access to this collection",
        );

      await workspaceStorage.deleteCollection(id);
      res.status(204).send();
    },
  );

  // Direct collaborator grants are managed only by the workspace owner.
  const collaboratorInput = z.object({
    email: z.string().trim().email().max(320),
    permission: z.enum(["view", "edit"]),
  });
  const permissionInput = z.object({ permission: z.enum(["view", "edit"]) });
  const ownerWorkspace = async (req: Request) => {
    const workspace = await workspaceStorage.getWorkspace(getParamId(req));
    return workspace?.userId === getUserId(req) ? workspace : undefined;
  };
  app.get(
    "/api/v1/workspaces/:id/collaborators",
    isAuthenticated,
    async (req, res) => {
      if (!(await ownerWorkspace(req)))
        return fail(req, res, "FORBIDDEN", "Forbidden");
      const grants = await workspaceStorage.listWorkspaceCollaborators(
        getParamId(req),
      );
      const byId = new Map<
        string,
        Awaited<ReturnType<typeof getCollaboratorProfiles>>["users"][number]
      >();
      for (let offset = 0; offset < grants.length; offset += 100) {
        const profiles = await getCollaboratorProfiles(
          grants.slice(offset, offset + 100).map((grant) => grant.userId),
          { requestId: req.requestId },
        );
        for (const user of profiles.users) byId.set(user.id, user);
      }
      return res.json({
        collaborators: grants.map((grant) => ({
          userId: grant.userId,
          permission: grant.permission,
          profile: byId.get(grant.userId) ?? null,
        })),
      });
    },
  );
  app.post(
    "/api/v1/workspaces/:id/collaborators",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      if (!(await ownerWorkspace(req)))
        return fail(req, res, "FORBIDDEN", "Forbidden");
      const parsed = collaboratorInput.safeParse(req.body);
      if (!parsed.success)
        return fail(req, res, "VALIDATION_FAILED", "Invalid collaborator");
      const { user } = await lookupCollaboratorIdentity(parsed.data.email, {
        requestId: req.requestId,
      });
      if (!user || user.id === getUserId(req))
        return fail(
          req,
          res,
          "VALIDATION_FAILED",
          "Unable to add this collaborator",
        );
      const grant = await workspaceStorage.upsertWorkspaceCollaborator({
        workspaceId: getParamId(req),
        userId: user.id,
        permission: parsed.data.permission,
        addedBy: getUserId(req),
      });
      return res.status(201).json({
        userId: grant.userId,
        permission: grant.permission,
        profile: user,
      });
    },
  );
  app.patch(
    "/api/v1/workspaces/:id/collaborators/:userId",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      if (!(await ownerWorkspace(req)))
        return fail(req, res, "FORBIDDEN", "Forbidden");
      const parsed = permissionInput.safeParse(req.body);
      if (!parsed.success)
        return fail(req, res, "VALIDATION_FAILED", "Invalid permission");
      const target = getParamId(req, "userId");
      if (target === getUserId(req))
        return fail(req, res, "VALIDATION_FAILED", "Cannot modify the owner");
      const grants = await workspaceStorage.listWorkspaceCollaborators(
        getParamId(req),
      );
      if (!grants.some((grant) => grant.userId === target))
        return fail(req, res, "NOT_FOUND", "Collaborator not found");
      const grant =
        await workspaceStorage.updateWorkspaceCollaboratorPermission(
          getParamId(req),
          target,
          parsed.data.permission,
        );
      return res.json({ userId: grant.userId, permission: grant.permission });
    },
  );
  app.delete(
    "/api/v1/workspaces/:id/collaborators/:userId",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      if (!(await ownerWorkspace(req)))
        return fail(req, res, "FORBIDDEN", "Forbidden");
      const target = getParamId(req, "userId");
      if (target === getUserId(req))
        return fail(req, res, "VALIDATION_FAILED", "Cannot remove the owner");
      await workspaceStorage.removeWorkspaceCollaborator(
        getParamId(req),
        target,
      );
      return res.status(204).end();
    },
  );

  // Workspace routes
  app.get(api.workspaces.list.path, isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const collectionId = req.query.collectionId
      ? Number(req.query.collectionId)
      : null;
    const requestId = req.requestId ?? "unscoped";
    try {
      const workspaces = await workspaceStorage.getWorkspaces(
        userId,
        collectionId,
        requestId,
      );
      res.json(workspaces);
    } catch (error) {
      logTraceback(log, "Failed to list workspaces", error, {
        userId,
        requestId,
      });
      fail(
        req,
        res,
        "WORKSPACE_LIST_UNAVAILABLE",
        "Workspace listing is temporarily unavailable. Try again shortly.",
      );
    }
  });

  function getParamId(req: Request, param = "id"): string {
    const val = req.params[param];
    return Array.isArray(val) ? val[0] : val || "";
  }

  app.get(api.workspaces.get.path, isAuthenticated, async (req, res) => {
    const id = getParamId(req);
    try {
      const workspace = await workspaceStorage.getWorkspace(id);
      if (!workspace) return fail(req, res, "NOT_FOUND", "Workspace not found");

      const userId = getUserId(req);
      const hasAccess =
        isWorkspaceOwner(workspace, userId) ||
        (await access.canAccessWorkspace(userId, workspace.id));
      if (!hasAccess)
        return fail(
          req,
          res,
          "FORBIDDEN",
          "You do not have access to this workspace",
        );

      res.json(workspace);
    } catch (error) {
      // A workspace that exists must never 500 opaquely on open: a database
      // failure here is a dependency outage (503), joined by request ID.
      // Full stack + cause chain go to the log; the client gets the envelope.
      logTraceback(log, "Failed to load workspace", error, {
        userId: req.user?.id,
        workspaceId: id,
        requestId: req.requestId ?? "unscoped",
      });
      fail(
        req,
        res,
        "WORKSPACE_UNAVAILABLE",
        "Workspace service is temporarily unavailable. Try again shortly.",
      );
    }
  });

  app.post(
    api.workspaces.create.path,
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      try {
        const input = api.workspaces.create.input.parse(req.body);
        const userId = getUserId(req);
        const workspace = await workspaceStorage.createWorkspace({
          ...input,
          userId,
        });
        res.status(201).json(workspace);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return fail(req, res, "VALIDATION_FAILED", firstIssueMessage(err), {
            issues: zodIssues(err),
          });
        }
        logTraceback(log, "Failed to create workspace", err, {
          userId: getUserId(req),
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "WORKSPACE_UNAVAILABLE",
          "Workspace could not be created. Try again shortly.",
        );
      }
    },
  );

  app.put(
    api.workspaces.update.path,
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      try {
        const input = api.workspaces.update.input.parse(req.body);
        const id = getParamId(req);
        const existing = await workspaceStorage.getWorkspace(id);
        if (!existing) return fail(req, res, "NOT_FOUND", "Not found");

        const userId = getUserId(req);
        const role = isWorkspaceOwner(existing, userId)
          ? "workspace-owner"
          : await access.getWorkspaceRole(id, userId);
        if (!canEditWorkspace(role)) {
          return fail(
            req,
            res,
            "FORBIDDEN",
            "Forbidden: Insufficient permissions to modify workspace",
          );
        }

        const updated = await workspaceStorage.updateWorkspace(id, input);
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return fail(req, res, "VALIDATION_FAILED", firstIssueMessage(err), {
            issues: zodIssues(err),
          });
        }
        logTraceback(log, "Failed to update workspace", err, {
          userId: getUserId(req),
          workspaceId: getParamId(req),
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "WORKSPACE_UNAVAILABLE",
          "Workspace could not be updated. Try again shortly.",
        );
      }
    },
  );

  app.delete(
    api.workspaces.delete.path,
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const id = getParamId(req);
      const existing = await workspaceStorage.getWorkspace(id);
      if (!existing) return fail(req, res, "NOT_FOUND", "Not found");

      const userId = getUserId(req);

      const hasAccess =
        isWorkspaceOwner(existing, userId) ||
        (await access.canAccessWorkspace(userId, id));
      if (!hasAccess)
        return fail(req, res, "FORBIDDEN", "No access to this workspace");

      const role = isWorkspaceOwner(existing, userId)
        ? "workspace-owner"
        : await access.getWorkspaceRole(id, userId);
      if (!canDeleteWorkspace(role)) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Forbidden: Only admins and owners can delete this workspace",
        );
      }

      await workspaceStorage.deleteWorkspaceAndEnqueueCleanup(id);
      workspaceOutbox.wake();
      res.status(204).send();
    },
  );

  app.post(
    api.workspaces.duplicate.path,
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const id = getParamId(req);
      const existing = await workspaceStorage.getWorkspace(id);
      if (!existing) return fail(req, res, "NOT_FOUND", "Not found");

      const userId = getUserId(req);
      const role = isWorkspaceOwner(existing, userId)
        ? "workspace-owner"
        : await access.getWorkspaceRole(id, userId);
      if (!canDeleteWorkspace(role)) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Forbidden: Only admins and owners can duplicate this workspace",
        );
      }

      const { title } = req.body;
      const duplicated =
        await workspaceStorage.duplicateWorkspaceAndEnqueueCanvasCopy(
          id,
          title,
        );
      workspaceOutbox.wake();

      res.status(201).json(duplicated);
    },
  );

  app.post(
    "/api/v1/workspaces/:id/retry-canvas-copy",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const id = getParamId(req);
      const workspace = await workspaceStorage.getWorkspace(id);
      if (!workspace) return fail(req, res, "NOT_FOUND", "Not found");

      const userId = getUserId(req);
      const role = isWorkspaceOwner(workspace, userId)
        ? "workspace-owner"
        : await access.getWorkspaceRole(id, userId);
      if (!canDeleteWorkspace(role)) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Forbidden: Only admins and owners can retry a canvas copy",
        );
      }

      try {
        const retrying = await workspaceStorage.retryCanvasCopy(id);
        workspaceOutbox.wake();
        res.json(retrying);
      } catch (error) {
        // Raw storage text stays in the logs — clients get a stable code
        // they can switch on plus the request ID to quote to support.
        logTraceback(log, "Canvas copy retry failed", error, {
          userId,
          workspaceId: id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "CANVAS_COPY_RETRY_FAILED",
          "Canvas copy retry failed. Check copy status and try again.",
        );
      }
    },
  );
}
