import type { Express } from "express";
import { teamStorage } from "./db/storage";
import { registerTeamRoutes } from "./routes/teamRoutes";
import { registerTeamInternalRoutes } from "./db/internal-routes";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("team-service");

export class TeamService {
  static initialize(app: Express, context: AppContext) {
    registerTeamRoutes(app, context);
    registerTeamInternalRoutes(app);

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

  static storage = teamStorage;
}

export * from "./db";
export * from "./websocket";
export * from "./routes";
export { teamStorage };
