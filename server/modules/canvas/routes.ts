import type { Express, RequestHandler } from "express";
import { canvasStorage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { csrfProtection } from "../../middleware/csrf";
import { createChildLogger } from "../../lib/logger";
import type { AppContext } from "../../lib/registry";
import type { IWorkspaceStorage } from "../workspace/storage";
import type { ITeamStorage } from "../team/storage";

import { canEditWorkspace } from "../../lib/permissions";

const log = createChildLogger("canvas");

export function registerCanvasRoutes(app: Express, context: AppContext) {
  const isAuthenticated =
    context.registry.get<RequestHandler>("isAuthenticated");
  const workspaceStorage =
    context.registry.get<IWorkspaceStorage>("workspaceStorage");
  const teamStorage = context.registry.get<ITeamStorage>("teamStorage");

  // Canvas logic routes
  app.get(api.workspaces.getCanvas.path, isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    const workspace = await workspaceStorage.getWorkspace(id);
    if (!workspace)
      return res.status(404).json({ message: "Workspace not found" });

    const userId = req.user!.id;
    const hasAccess = await teamStorage.canAccessWorkspace(
      userId,
      workspace.id,
    );
    if (!hasAccess)
      return res
        .status(403)
        .json({ message: "You do not have access to this workspace" });

    const nodes = await canvasStorage.getNodes(id);
    const edges = await canvasStorage.getEdges(id);
    res.json({ nodes, edges });
  });

  app.post(
    api.workspaces.syncCanvas.path,
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      const id = Number(req.params.id);
      const workspace = await workspaceStorage.getWorkspace(id);
      if (!workspace)
        return res.status(404).json({ message: "Workspace not found" });

      const userId = req.user!.id;
      const role = await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return res.status(403).json({
          message: "Forbidden: Insufficient permissions to modify canvas",
        });
      }

      const { nodes, edges } = api.workspaces.syncCanvas.input.parse(req.body);
      await canvasStorage.syncCanvas(id, nodes, edges);
      res.json({ success: true });
    },
  );

  // Duplicate canvas data when duplicating workspace
  app.post(
    "/api/v1/workspaces/:id/duplicate-canvas",
    csrfProtection,
    isAuthenticated,
    async (req, res) => {
      const id = Number(req.params.id);
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

      // Validate destination workspace — must be owned by the user
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
