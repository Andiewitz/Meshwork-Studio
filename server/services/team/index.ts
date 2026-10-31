import type { Express } from "express";
import { teamStorage } from "./db/storage";
import { registerTeamRoutes } from "./routes/teamRoutes";
import { registerTeamInternalRoutes } from "./db/internal-routes";
import { createChildLogger } from "@server/lib/logger";
import type { TeamDependencies } from "./dependencies";

const log = createChildLogger("team-service");

export class TeamService {
  static initialize(app: Express, context: TeamDependencies) {
    registerTeamRoutes(app, context);
    registerTeamInternalRoutes(app);

    context.eventBus.registerRequired(
      "account.cleanup.team",
      async ({ userId }, { operationId }) => {
        await teamStorage.deleteAllUserData(userId);
        return { operationId, status: "completed" };
      },
    );

    context.eventBus.on("user.deleted", async ({ id }) => {
      try {
        await teamStorage.deleteAllUserData(id);
        log.info({ userId: id }, "User team data deleted via event");
      } catch (err) {
        log.error({ err, userId: id }, "Failed to delete user team data");
      }
    });

    log.info("Team service initialized");
  }
}
