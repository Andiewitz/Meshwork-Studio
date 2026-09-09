import type { Express } from "express";
import { canvasStorage } from "./db/storage";
import { ensureCanvasTable } from "./db/dynamo";
import { registerCanvasRoutes } from "./routes/canvasRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("canvas-service");

export class CanvasService {
  static initialize(app: Express, context: AppContext) {
    registerCanvasRoutes(app, context);
    void ensureCanvasTable();

    // Listen to external events
    context.eventBus.on("workspace.deleted", async ({ id }) => {
      try {
        await canvasStorage.deleteWorkspaces([id]);
        log.info({ workspaceId: id }, "Canvas data deleted via event");
      } catch (err) {
        log.error({ err, workspaceId: id }, "Failed to delete canvas data");
        throw err;
      }
    });

    context.eventBus.on(
      "workspace.duplicated",
      async ({ originalId, newId }) => {
        try {
          await canvasStorage.duplicateCanvas(originalId, newId);
          log.info({ originalId, newId }, "Canvas data duplicated via event");
        } catch (err) {
          log.error(
            { err, originalId, newId },
            "Failed to duplicate canvas data",
          );
        }
      },
    );

    context.eventBus.on("workspaces.deleted", async ({ ids }) => {
      if (ids.length === 0) return;
      try {
        await canvasStorage.deleteWorkspaces(ids);
        log.info({ count: ids.length }, "User canvas data deleted via event");
      } catch (err) {
        log.error({ err }, "Failed to delete user canvas data");
        throw err;
      }
    });

    log.info("Canvas service initialized");
  }

  static storage = canvasStorage;
}

// Backward compatibility alias
export const CanvasModule = CanvasService;

export * from "./db";
export * from "./routes";
export { canvasStorage };
