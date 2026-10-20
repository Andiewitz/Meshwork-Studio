import type { Express, RequestHandler } from "express";
import { canvasStorage } from "../db/storage";
import {
  cacheCanvas,
  canvasEtag,
  etagMatches,
  invalidateCanvas,
  readCachedCanvas,
} from "../cache";
import {
  CanvasDocConfigError,
  CanvasRevisionConflictError,
  CanvasWriteIncompleteError,
  CanvasWriteLockedError,
} from "../db/dynamo";
import { api } from "@shared/routes";
import type { z } from "zod";
import { canvasEdgeSchema, canvasNodeSchema } from "@shared/canvas";
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

function isWorkspaceOwner(
  workspace: { userId: string | null },
  userId: string,
) {
  return workspace.userId === userId;
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
        requestId: req.requestId ?? "unscoped",
        message: "This workspace canvas is still being copied.",
      });
    }
    if (workspace.canvasCopyStatus === "failed") {
      return res.status(503).json({
        code: "CANVAS_COPY_FAILED",
        requestId: req.requestId ?? "unscoped",
        message:
          "This workspace canvas copy failed. Retry it from the dashboard.",
      });
    }

    const userId = req.user!.id;
    const hasAccess =
      isWorkspaceOwner(workspace, userId) ||
      (await teamStorage.canAccessWorkspace(userId, workspace.id));
    if (!hasAccess)
      return res
        .status(403)
        .json({ message: "You do not have access to this workspace" });

    try {
      let snapshot = await readCachedCanvas(id);
      if (!snapshot) {
        snapshot = await canvasStorage.getCanvas(id);
        await cacheCanvas(id, snapshot);
      }
      res.set("ETag", canvasEtag(snapshot.revision));
      res.set("Cache-Control", "private, no-cache");
      if (etagMatches(req.headers["if-none-match"], snapshot.revision)) {
        return res.status(304).end();
      }
      res.json(snapshot);
    } catch (err) {
      if (err instanceof CanvasDocConfigError) {
        return res.status(503).json({
          code: err.code,
          requestId: req.requestId ?? "unscoped",
          message: "Canvas storage is not configured for this document size.",
        });
      }
      throw err;
    }
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
          requestId: req.requestId ?? "unscoped",
          message: "This workspace canvas is still being copied.",
        });
      }
      if (workspace.canvasCopyStatus === "failed") {
        return res.status(503).json({
          code: "CANVAS_COPY_FAILED",
          requestId: req.requestId ?? "unscoped",
          message:
            "This workspace canvas copy failed. Retry it from the dashboard.",
        });
      }

      const userId = req.user!.id;
      const role = isWorkspaceOwner(workspace, userId)
        ? "workspace-owner"
        : await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return res.status(403).json({
          message: "Forbidden: Insufficient permissions to modify canvas",
        });
      }

      const input = api.workspaces.syncCanvas.input.safeParse(req.body);
      if (!input.success) {
        return res.status(400).json({
          code: "INVALID_CANVAS",
          requestId: req.requestId ?? "unscoped",
          message: "Canvas contains invalid nodes or connections.",
          issues: input.error.issues.slice(0, 10).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      const { nodes, edges, baseRevision } = input.data;
      try {
        const revision = await canvasStorage.syncCanvas(
          id,
          nodes,
          edges,
          baseRevision,
        );
        await cacheCanvas(id, { nodes, edges, revision }, baseRevision);
        res.set("ETag", canvasEtag(revision));
        res.json({ success: true, revision });
      } catch (err) {
        if (err instanceof CanvasRevisionConflictError) {
          return res.status(409).json({
            code: err.code,
            requestId: req.requestId ?? "unscoped",
            message: "Canvas changed elsewhere. Reload before saving again.",
            revision: err.currentRevision,
          });
        }
        if (err instanceof CanvasWriteLockedError) {
          return res.status(503).json({
            code: err.code,
            requestId: req.requestId ?? "unscoped",
            message: "Another canvas save is in progress. Retry shortly.",
          });
        }
        if (err instanceof CanvasWriteIncompleteError) {
          return res.status(503).json({
            code: err.code,
            requestId: req.requestId ?? "unscoped",
            message: "Canvas save was not fully written. Retry shortly.",
          });
        }
        if (err instanceof CanvasDocConfigError) {
          return res.status(503).json({
            code: err.code,
            requestId: req.requestId ?? "unscoped",
            message: "Canvas storage is not configured for this document size.",
          });
        }
        throw err;
      }
    },
  );

  // Import a canvas from an uploaded JSON file. Unlike syncCanvas (strict:
  // one bad field rejects everything), import is forgiving by design:
  // - body without nodes[]/edges[] → 422, it doesn't belong here at all
  // - items with bad fields are dropped individually, survivors import,
  //   and the response says exactly what got in and what didn't
  // - nothing usable at all → 422
  app.post(
    "/api/v1/workspaces/:id/import-canvas",
    csrfProtect,
    isAuthenticated,
    async (req, res) => {
      const requestId = req.requestId ?? "unscoped";
      const id = getParamId(req);
      const workspace = await workspaceStorage.getWorkspace(id);
      if (!workspace)
        return res.status(404).json({ message: "Workspace not found" });

      const userId = req.user!.id;
      const role = isWorkspaceOwner(workspace, userId)
        ? "workspace-owner"
        : await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return res.status(403).json({
          message: "Forbidden: Insufficient permissions to import canvas",
        });
      }

      const body = req.body as unknown;
      const rawNodes =
        typeof body === "object" &&
        body !== null &&
        Array.isArray((body as { nodes?: unknown }).nodes)
          ? (body as { nodes: unknown[] }).nodes
          : undefined;
      const rawEdges =
        typeof body === "object" &&
        body !== null &&
        Array.isArray((body as { edges?: unknown }).edges)
          ? (body as { edges: unknown[] }).edges
          : undefined;
      if (!rawNodes || !rawEdges) {
        return res.status(422).json({
          code: "NOT_A_CANVAS_FILE",
          message:
            "That file doesn't look like a canvas — it needs a nodes list and an edges list.",
          requestId,
        });
      }
      if (rawNodes.length > 5_000 || rawEdges.length > 10_000) {
        return res.status(422).json({
          code: "IMPORT_TOO_LARGE",
          message:
            "That file is too big to import (max 5,000 nodes / 10,000 edges). Split it and try again.",
          requestId,
        });
      }

      interface ImportWarning {
        kind: "node" | "edge";
        index: number;
        id?: unknown;
        reasons: string[];
      }
      const MAX_WARNINGS = 10;
      const warnings: ImportWarning[] = [];
      const pushWarning = (w: ImportWarning) => {
        if (warnings.length < MAX_WARNINGS) warnings.push(w);
      };

      const validNodes: z.infer<typeof canvasNodeSchema>[] = [];
      let droppedNodes = 0;
      rawNodes.forEach((item, index) => {
        const parsed = canvasNodeSchema.safeParse(item);
        if (parsed.success) {
          validNodes.push(parsed.data);
          return;
        }
        droppedNodes += 1;
        pushWarning({
          kind: "node",
          index,
          id:
            typeof item === "object" && item !== null
              ? (item as { id?: unknown }).id
              : undefined,
          reasons: parsed.error.issues.map(
            (issue) => `${issue.path.join(".") || "(item)"}: ${issue.message}`,
          ),
        });
      });

      const validEdges: z.infer<typeof canvasEdgeSchema>[] = [];
      let droppedEdges = 0;
      rawEdges.forEach((item, index) => {
        const parsed = canvasEdgeSchema.safeParse(item);
        if (parsed.success) {
          validEdges.push(parsed.data);
          return;
        }
        droppedEdges += 1;
        pushWarning({
          kind: "edge",
          index,
          id:
            typeof item === "object" && item !== null
              ? (item as { id?: unknown }).id
              : undefined,
          reasons: parsed.error.issues.map(
            (issue) => `${issue.path.join(".") || "(item)"}: ${issue.message}`,
          ),
        });
      });

      if (validNodes.length === 0 && validEdges.length === 0) {
        log.warn(
          { workspaceId: id, userId, requestId },
          "Canvas import rejected: nothing usable in file",
        );
        return res.status(422).json({
          code: "NOTHING_IMPORTABLE",
          message:
            "Nothing in that file could be used — every node and edge failed validation. Check the warnings and try again.",
          warnings,
          requestId,
        });
      }

      const revision = await canvasStorage.getCanvasRevision(id);
      const nextRevision = await canvasStorage.syncCanvas(
        id,
        validNodes,
        validEdges,
        revision,
      );
      await cacheCanvas(
        id,
        { nodes: validNodes, edges: validEdges, revision: nextRevision },
        revision,
      );
      log.info(
        {
          workspaceId: id,
          userId,
          requestId,
          importedNodes: validNodes.length,
          importedEdges: validEdges.length,
          droppedNodes,
          droppedEdges,
        },
        "Canvas import complete",
      );
      res.json({
        success: true,
        imported: { nodes: validNodes.length, edges: validEdges.length },
        dropped: { nodes: droppedNodes, edges: droppedEdges },
        warnings,
        revision: nextRevision,
        requestId,
      });
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
      const role = isWorkspaceOwner(workspace, userId)
        ? "workspace-owner"
        : await teamStorage.getWorkspaceRole(workspace.id, userId);
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
      await invalidateCanvas(toWorkspaceId);
      res.json({ success: true });
    },
  );
}
