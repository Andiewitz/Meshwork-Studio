import type { Express } from "express";
import { canvasStorage } from "./db/storage";
import { registerCanvasRoutes } from "./routes/canvasRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("canvas-service");

export class CanvasService {
  static initialize(app: Express, context: AppContext) {
    registerCanvasRoutes(app, context);

    // Listen to external events
    context.eventBus.on("workspace.deleted", async ({ id }) => {
      try {
        await canvasStorage.syncCanvas(id, [], []);
        log.info({ workspaceId: id }, "Canvas data deleted via event");
      } catch (err) {
        log.error({ err, workspaceId: id }, "Failed to delete canvas data");
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

    context.eventBus.on("user.deleted", async ({ id, tx }) => {
      try {
        await canvasStorage.deleteAllUserData(id, tx);
        log.info({ userId: id }, "User canvas data deleted via event");
      } catch (err) {
        log.error({ err, userId: id }, "Failed to delete user canvas data");
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
