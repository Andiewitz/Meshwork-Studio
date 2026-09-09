import type { Express } from "express";
import { workspaceStorage } from "./db/storage";
import { registerWorkspaceRoutes } from "./routes/workspaceRoutes";
import { registerWorkspaceInternalRoutes } from "./db/internal-routes";
import { pool } from "./db/connection";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";
import { workspaceOutbox } from "./outbox-service";

const log = createChildLogger("workspace-service");

export class WorkspaceService {
  static initialize(app: Express, context: AppContext) {
    registerWorkspaceRoutes(app, context);
    registerWorkspaceInternalRoutes(app as any);
    workspaceOutbox.start(context.eventBus);

    context.eventBus.on("user.deleted", async ({ id }) => {
      try {
        const ownedIds =
          await workspaceStorage.deleteAllUserDataAndEnqueueCleanup(id);
        workspaceOutbox.wake();
        log.info(
          { userId: id, workspaces: ownedIds.length },
          "User workspaces and collections deleted via event",
        );
      } catch (err) {
        log.error({ err, userId: id }, "Failed to delete user workspaces");
      }
    });

    log.info("Workspace service initialized");
  }

  static storage = workspaceStorage;

  static shutdown() {
    workspaceOutbox.stop();
  }
}

// Backward compatibility alias
export const WorkspaceModule = WorkspaceService;

export * from "./db";
export * from "./routes";
export { workspaceStorage };
