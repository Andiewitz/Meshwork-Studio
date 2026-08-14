import type { Express } from "express";
import { teamStorage } from "./db/storage";
import { registerTeamRoutes } from "./routes/teamRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("team-service");

export class TeamService {
  static initialize(app: Express, context: AppContext) {
    registerTeamRoutes(app, context);

    context.eventBus.on("user.deleted", async ({ id, tx }) => {
      try {
        await teamStorage.deleteAllUserData(id, tx);
        log.info({ userId: id }, "User team data deleted via event");
      } catch (err) {
        log.error({ err, userId: id }, "Failed to delete user team data");
      }
    });

    log.info("Team service initialized");
  }

  static storage = teamStorage;
}

// Backward compatibility alias
export const TeamModule = TeamService;

export * from "./db";
export * from "./websocket";
export * from "./routes";
export { teamStorage };
