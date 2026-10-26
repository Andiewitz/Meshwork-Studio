import type { Express } from "express";
import { canvasStorage } from "./db/storage";
import { ensureCanvasTable } from "./db/dynamo";
import { registerCanvasRoutes } from "./routes/canvasRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { CanvasDependencies } from "./dependencies";
import { copyWorkspaceCanvas } from "./copy-workspace";

const log = createChildLogger("canvas-service");

export class CanvasService {
  static initialize(app: Express, context: CanvasDependencies) {
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
          const outcome = await copyWorkspaceCanvas(
            context.workspaces,
            canvasStorage,
            originalId,
            newId,
            operationId,
          );
          if (outcome === "obsolete") {
            log.info(
              { originalId, newId },
              "Skipped obsolete canvas copy event",
            );
            return { operationId, status: "completed" };
          }
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
}

// Backward compatibility alias
export const CanvasModule = CanvasService;
