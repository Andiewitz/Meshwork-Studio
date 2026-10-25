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
  CanvasInvalidGraphError,
  CanvasRevisionConflictError,
  CanvasWriteIncompleteError,
  CanvasWriteLockedError,
} from "../db/dynamo";
import { api } from "@shared/routes";
import type { z } from "zod";
import { canvasEdgeSchema, canvasNodeSchema } from "@shared/canvas";
import type { CanvasSnapshot } from "../db/model";
import { csrfProtect } from "../../../auth";
import { createChildLogger } from "@server/lib/logger";
import { fail } from "@server/lib/errorEnvelope";
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
    if (!workspace) return fail(req, res, "NOT_FOUND", "Workspace not found");
    if (workspace.canvasCopyStatus === "copying") {
      return fail(
        req,
        res,
        "CANVAS_COPY_IN_PROGRESS",
        "This workspace canvas is still being copied.",
      );
    }
    if (workspace.canvasCopyStatus === "failed") {
      return fail(
        req,
        res,
        "CANVAS_COPY_FAILED",
        "This workspace canvas copy failed. Retry it from the dashboard.",
      );
    }

    const userId = req.user!.id;
    const hasAccess =
      isWorkspaceOwner(workspace, userId) ||
      (await teamStorage.canAccessWorkspace(userId, workspace.id));
    if (!hasAccess)
      return fail(
        req,
        res,
        "FORBIDDEN",
        "You do not have access to this workspace",
      );

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
        return fail(
          req,
          res,
          err.code,
          "Canvas storage is not configured for this document size.",
        );
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
      if (!workspace) return fail(req, res, "NOT_FOUND", "Workspace not found");
      if (workspace.canvasCopyStatus === "copying") {
        return fail(
          req,
          res,
          "CANVAS_COPY_IN_PROGRESS",
          "This workspace canvas is still being copied.",
        );
      }
      if (workspace.canvasCopyStatus === "failed") {
        return fail(
          req,
          res,
          "CANVAS_COPY_FAILED",
          "This workspace canvas copy failed. Retry it from the dashboard.",
        );
      }

      const userId = req.user!.id;
      const role = isWorkspaceOwner(workspace, userId)
        ? "workspace-owner"
        : await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Forbidden: Insufficient permissions to modify canvas",
        );
      }

      const input = api.workspaces.syncCanvas.input.safeParse(req.body);
      if (!input.success) {
        return fail(
          req,
          res,
          "INVALID_CANVAS",
          "Canvas contains invalid nodes or connections.",
          {
            issues: input.error.issues.slice(0, 10).map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        );
      }
      const { baseRevision } = input.data;
      try {
        let snapshot: CanvasSnapshot;
        if ("changes" in input.data) {
          snapshot = await canvasStorage.syncCanvasChanges(
            id,
            input.data.changes,
            baseRevision,
          );
        } else {
          const revision = await canvasStorage.syncCanvas(
            id,
            input.data.nodes,
            input.data.edges,
            baseRevision,
          );
          snapshot = {
            nodes: input.data.nodes,
            edges: input.data.edges,
            revision,
          };
        }
        await cacheCanvas(id, snapshot, baseRevision);
        res.set("ETag", canvasEtag(snapshot.revision));
        res.json({ success: true, revision: snapshot.revision });
      } catch (err) {
        if (err instanceof CanvasInvalidGraphError) {
          return fail(
            req,
            res,
            err.code,
            "Canvas contains invalid nodes or connections.",
            { issues: err.issues },
          );
        }
        if (err instanceof CanvasRevisionConflictError) {
          return fail(
            req,
            res,
            err.code,
            "Canvas changed elsewhere. Reload before saving again.",
            { extra: { revision: err.currentRevision } },
          );
        }
        if (err instanceof CanvasWriteLockedError) {
          return fail(
            req,
            res,
            err.code,
            "Another canvas save is in progress. Retry shortly.",
          );
        }
        if (err instanceof CanvasWriteIncompleteError) {
          return fail(
            req,
            res,
            err.code,
            "Canvas save was not fully written. Retry shortly.",
          );
        }
        if (err instanceof CanvasDocConfigError) {
          return fail(
            req,
            res,
            err.code,
            "Canvas storage is not configured for this document size.",
          );
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
      if (!workspace) return fail(req, res, "NOT_FOUND", "Workspace not found");

      const userId = req.user!.id;
      const role = isWorkspaceOwner(workspace, userId)
        ? "workspace-owner"
        : await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Forbidden: Insufficient permissions to import canvas",
        );
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
        return fail(
          req,
          res,
          "NOT_A_CANVAS_FILE",
          "That file doesn't look like a canvas — it needs a nodes list and an edges list.",
        );
      }
      if (rawNodes.length > 5_000 || rawEdges.length > 10_000) {
        return fail(
          req,
          res,
          "IMPORT_TOO_LARGE",
          "That file is too big to import (max 5,000 nodes / 10,000 edges). Split it and try again.",
        );
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
        return fail(
          req,
          res,
          "NOTHING_IMPORTABLE",
          "Nothing in that file could be used — every node and edge failed validation. Check the warnings and try again.",
          {
            issues: warnings.map((w) => ({
              path: `${w.kind}[${w.index}]`,
              message: w.reasons.join("; "),
            })),
            extra: { warnings },
          },
        );
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
        return fail(req, res, "NOT_FOUND", "Source workspace not found");

      const userId = req.user!.id;
      const role = isWorkspaceOwner(workspace, userId)
        ? "workspace-owner"
        : await teamStorage.getWorkspaceRole(workspace.id, userId);
      if (!canEditWorkspace(role)) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Forbidden: Insufficient permissions to duplicate canvas",
        );
      }

      const destWorkspace = await workspaceStorage.getWorkspace(toWorkspaceId);
      if (!destWorkspace || destWorkspace.userId !== userId) {
        return fail(
          req,
          res,
          "FORBIDDEN",
          "Cannot write to destination workspace",
        );
      }

      await canvasStorage.duplicateCanvas(id, toWorkspaceId);
      await invalidateCanvas(toWorkspaceId);
      res.json({ success: true });
    },
  );
}
