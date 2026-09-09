import type { Express, RequestHandler } from "express";
import { canvasStorage } from "../db/storage";
import {
  CanvasRevisionConflictError,
  CanvasWriteIncompleteError,
  CanvasWriteLockedError,
} from "../db/dynamo";
import { api } from "@shared/routes";
import { csrfProtect } from "../../../auth";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";
import type { IWorkspaceStorage } from "@services/workspace/db/storage";
import type { ITeamStorage } from "@services/team/db/storage";
import { canEditWorkspace } from "@server/lib/permissions";

const log = createChildLogger("canvas-routes");

function getParamId(req: any, param = "id"): string {
  const val = req.params[param];
  return Array.isArray(val) ? val[0] : val || "";
}

export function registerCanvasRoutes(app: Express, context: AppContext) {
  const isAuthenticated =
    context.registry.get<RequestHandler>("isAuthenticated");
  const workspaceStorage =
    context.registry.get<IWorkspaceStorage>("workspaceStorage");
  const teamStorage = context.registry.get<ITeamStorage>("teamStorage");

  // Canvas logic routes
  app.get(api.workspaces.getCanvas.path, isAuthenticated, async (req, res) => {
    const id = getParamId(req);
    const workspace = await workspaceStorage.getWorkspace(id);
    if (!workspace)
      return res.status(404).json({ message: "Workspace not found" });
    if (workspace.canvasCopyStatus === "copying") {
      return res.status(409).json({
        code: "CANVAS_COPY_IN_PROGRESS",
        message: "This workspace canvas is still being copied.",
      });
    }
    if (workspace.canvasCopyStatus === "failed") {
      return res.status(503).json({
        code: "CANVAS_COPY_FAILED",
        message:
          "This workspace canvas copy failed. Retry it from the dashboard.",
      });
    }

    const userId = req.user!.id;
    const hasAccess = await teamStorage.canAccessWorkspace(
      userId,
      workspace.id,
    );
    if (!hasAccess)
      return res
        .status(403)
        .json({ message: "You do not have access to this workspace" });

    const [nodes, edges, revision] = await Promise.all([
      canvasStorage.getNodes(id),
      canvasStorage.getEdges(id),
      canvasStorage.getCanvasRevision(id),
    ]);
    res.json({ nodes, edges, revision });
  });

  app.post(
    api.workspaces.syncCanvas.path,
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const id = getParamId(req);
      const workspace = await workspaceStorage.getWorkspace(id);
      if (!workspace)
        return res.status(404).json({ message: "Workspace not found" });
      if (workspace.canvasCopyStatus === "copying") {
        return res.status(409).json({
          code: "CANVAS_COPY_IN_PROGRESS",
          message: "This workspace canvas is still being copied.",
        });
      }
      if (workspace.canvasCopyStatus === "failed") {
        return res.status(503).json({
          code: "CANVAS_COPY_FAILED",
          message:
            "This workspace canvas copy failed. Retry it from the dashboard.",
        });
      }

      const userId = req.user!.id;
      const role = await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return res.status(403).json({
          message: "Forbidden: Insufficient permissions to modify canvas",
        });
      }

      const { nodes, edges, baseRevision } =
        api.workspaces.syncCanvas.input.parse(req.body);
      try {
        const revision = await canvasStorage.syncCanvas(
          id,
          nodes,
          edges,
          baseRevision,
        );
        res.json({ success: true, revision });
      } catch (err) {
        if (err instanceof CanvasRevisionConflictError) {
          return res.status(409).json({
            code: err.code,
            message: "Canvas changed elsewhere. Reload before saving again.",
            revision: err.currentRevision,
          });
        }
        if (err instanceof CanvasWriteLockedError) {
          return res.status(503).json({
            code: err.code,
            message: "Another canvas save is in progress. Retry shortly.",
          });
        }
        if (err instanceof CanvasWriteIncompleteError) {
          return res.status(503).json({
            code: err.code,
            message: "Canvas save was not fully written. Retry shortly.",
          });
        }
        throw err;
      }
    },
  );

  // Duplicate canvas data when duplicating workspace
  app.post(
    "/api/v1/workspaces/:id/duplicate-canvas",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const id = getParamId(req);
      const { toWorkspaceId } = req.body;

      const workspace = await workspaceStorage.getWorkspace(id);
      if (!workspace)
        return res.status(404).json({ message: "Source workspace not found" });

      const userId = req.user!.id;
      const role = await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return res.status(403).json({
          message: "Forbidden: Insufficient permissions to duplicate canvas",
        });
      }

      const destWorkspace = await workspaceStorage.getWorkspace(toWorkspaceId);
      if (!destWorkspace || destWorkspace.userId !== userId) {
        return res
          .status(403)
          .json({ message: "Cannot write to destination workspace" });
      }

      await canvasStorage.duplicateCanvas(id, toWorkspaceId);
      res.json({ success: true });
    },
  );
}
