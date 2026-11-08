import type { Express } from "express";
import { canvasStorage } from "./db/storage";
import {
  ensureCanvasTable,
  canvasTableReady,
  closeCanvasDynamo,
} from "./db/dynamo";
import { closeCanvasS3 } from "./db/s3-objects";
import { invalidateCanvas } from "./cache";
import { registerCanvasRoutes } from "./routes/canvasRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { CanvasDependencies } from "./dependencies";
import { copyWorkspaceCanvas } from "./copy-workspace";
import { logTraceback } from "@server/lib/traceback";
import {
  architectureArtifacts,
  closeArchitectureArtifacts,
} from "./db/architecture-artifacts";
import { registerArchitectureArtifactRoutes } from "./routes/architectureArtifactRoutes";

const log = createChildLogger("canvas-service");

let tableSetup: Promise<void> | undefined;

export class CanvasService {
  static async ready(): Promise<boolean> {
    return canvasTableReady();
  }
  static async shutdown(): Promise<void> {
    await tableSetup;
    closeCanvasDynamo();
    closeCanvasS3();
    closeArchitectureArtifacts();
  }
  static initialize(app: Express, context: CanvasDependencies) {
    registerCanvasRoutes(app, context);
    registerArchitectureArtifactRoutes(app, context);
    tableSetup = ensureCanvasTable();

    // Listen to external events
    context.eventBus.registerRequired(
      "workspace.deleted",
      async ({ id }, { operationId }) => {
        try {
          await canvasStorage.deleteWorkspaces([id]);
          await architectureArtifacts.purge(id);
          await invalidateCanvas(id);
          log.info(
            { workspaceId: id, operationId },
            "Canvas data deleted via event",
          );
          return { operationId, status: "completed" };
        } catch (err) {
          logTraceback(log, "Failed to delete canvas data", err, {
            workspaceId: id,
          });
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
          await invalidateCanvas(newId);
          log.info(
            { originalId, newId, operationId },
            "Canvas data duplicated via event",
          );
          return { operationId, status: "completed" };
        } catch (err) {
          logTraceback(log, "Failed to duplicate canvas data", err, {
            originalId,
            newId,
          });
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
          await Promise.all(ids.map((id) => architectureArtifacts.purge(id)));
          await Promise.all(ids.map((id) => invalidateCanvas(id)));
          log.info(
            { count: ids.length, operationId },
            "User canvas data deleted via event",
          );
          return { operationId, status: "completed" };
        } catch (err) {
          logTraceback(log, "Failed to delete user canvas data", err);
          throw err;
        }
      },
    );

    log.info("Canvas service initialized");
  }
}

// Backward compatibility alias
export const CanvasModule = CanvasService;
