import type { Express } from "express";
import { workspaceStorage } from "./db/storage";
import { registerWorkspaceRoutes } from "./routes/workspaceRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("workspace-service");

export class WorkspaceService {
  static initialize(app: Express, context: AppContext) {
    registerWorkspaceRoutes(app, context);

    context.eventBus.on("user.deleted", async ({ id, tx }) => {
      try {
        await workspaceStorage.deleteAllUserData(id, tx);
        log.info(
          { userId: id },
          "User workspaces and collections deleted via event",
        );
      } catch (err) {
        log.error({ err, userId: id }, "Failed to delete user workspaces");
      }
    });

    log.info("Workspace service initialized");
  }

  static storage = workspaceStorage;
}

// Backward compatibility alias
export const WorkspaceModule = WorkspaceService;

export * from "./db";
export * from "./routes";
export { workspaceStorage };
