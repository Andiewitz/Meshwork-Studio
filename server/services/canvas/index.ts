import type { Express } from "express";
import { canvasStorage } from "./db/storage";
import { ensureCanvasTable } from "./db/dynamo";
import { registerCanvasRoutes } from "./routes/canvasRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";
import type { IWorkspaceStorage } from "@services/workspace/db/storage";

const log = createChildLogger("canvas-service");

export class CanvasService {
  static initialize(app: Express, context: AppContext) {
    registerCanvasRoutes(app, context);
    void ensureCanvasTable();

    // Listen to external events
    context.eventBus.registerRequired(
      "workspace.deleted",
      async ({ id }, { operationId }) => {
        try {
          await canvasStorage.deleteWorkspaces([id]);
          log.info(
            { workspaceId: id, operationId },
            "Canvas data deleted via event",
          );
          return { operationId, status: "completed" };
        } catch (err) {
          log.error({ err, workspaceId: id }, "Failed to delete canvas data");
          throw err;
        }
      },
    );

    context.eventBus.registerRequired(
      "workspace.duplicated",
      async ({ originalId, newId }, { operationId }) => {
        try {
          const workspaceStorage =
            context.registry.get<IWorkspaceStorage>("workspaceStorage");
          const target = await workspaceStorage.getWorkspace(newId);
          if (!target || target.canvasCopyStatus !== "copying") {
            log.info(
              { originalId, newId },
              "Skipped obsolete canvas copy event",
            );
            return { operationId, status: "completed" };
          }
          await canvasStorage.duplicateCanvas(originalId, newId, operationId);
          log.info(
            { originalId, newId, operationId },
            "Canvas data duplicated via event",
          );
          return { operationId, status: "completed" };
        } catch (err) {
          log.error(
            { err, originalId, newId },
            "Failed to duplicate canvas data",
          );
          throw err;
        }
      },
    );

    context.eventBus.registerRequired(
      "workspaces.deleted",
      async ({ ids }, { operationId }) => {
        if (ids.length === 0) return { operationId, status: "completed" };
        try {
          await canvasStorage.deleteWorkspaces(ids);
          log.info(
            { count: ids.length, operationId },
            "User canvas data deleted via event",
          );
          return { operationId, status: "completed" };
        } catch (err) {
          log.error({ err }, "Failed to delete user canvas data");
          throw err;
        }
      },
    );

    log.info("Canvas service initialized");
  }

  static storage = canvasStorage;
}

// Backward compatibility alias
export const CanvasModule = CanvasService;

export * from "./db";
export * from "./routes";
export { canvasStorage };
