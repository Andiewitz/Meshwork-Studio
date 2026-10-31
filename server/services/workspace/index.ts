import type { Express } from "express";
import { workspaceStorage } from "./db/storage";
import { registerWorkspaceRoutes } from "./routes/workspaceRoutes";
import { registerWorkspaceInternalRoutes } from "./db/internal-routes";
import { createChildLogger } from "@server/lib/logger";
import type { WorkspaceDependencies } from "./dependencies";
import { workspaceOutbox } from "./outbox-service";

const log = createChildLogger("workspace-service");

export class WorkspaceService {
  static initialize(app: Express, context: WorkspaceDependencies) {
    registerWorkspaceRoutes(app, context);
    registerWorkspaceInternalRoutes(app);
    workspaceOutbox.start(context.eventBus);

    context.eventBus.registerRequired(
      "account.cleanup.workspace",
      async ({ userId }, { operationId }) => {
        let status = await workspaceStorage.getUserCleanupStatus(
          userId,
          operationId,
        );
        if (status === "not_found") {
          await workspaceStorage.deleteAllUserDataAndEnqueueCleanup(
            userId,
            operationId,
          );
          workspaceOutbox.wake();
          status = await workspaceStorage.getUserCleanupStatus(
            userId,
            operationId,
          );
        }
        if (status === "failed")
          throw new Error("Workspace account cleanup failed");
        if (status === "not_found")
          throw new Error("Workspace account cleanup unavailable");
        return {
          operationId,
          status: status === "completed" ? "completed" : "published",
        };
      },
    );

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

  static async shutdown(): Promise<void> {
    await workspaceOutbox.stop();
  }
}

// Backward compatibility alias
export const WorkspaceModule = WorkspaceService;
