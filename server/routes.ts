import type { Express } from "express";
import type { Server } from "http";
import { initAuth, optionalAuth, requireAuth } from "./auth";
import { ensureSchema } from "./lib/migrate";
import { pool as workspacePool } from "@services/workspace/db/connection";
import { MIGRATIONS as workspaceMigrations } from "@services/workspace/db/migrations";
import { pool as teamPool } from "@services/team/db/connection";
import { MIGRATIONS as teamMigrations } from "@services/team/db/migrations";
import { pool as aiPool } from "@services/ai/db/connection";
import { MIGRATIONS as aiMigrations } from "@services/ai/db/migrations";
import { pool as metricsPool } from "@services/metrics/db/connection";
import { MIGRATIONS as metricsMigrations } from "@services/metrics/db/migrations";
import { WorkspaceService, workspaceStorage } from "@services/workspace";
import { CanvasService, canvasStorage } from "@services/canvas";
import { AIService } from "@services/ai";
import { TeamService, teamStorage } from "@services/team";
import { MetricsService } from "@services/metrics";
import { createChildLogger } from "./lib/logger";
import { AppRegistry } from "./lib/registry";
import { eventBus } from "./lib/events";
import { apiLimiter } from "./middleware/rateLimit";

const log = createChildLogger("server");

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // NOTE: /api/v1/auth/* and /api/v1/user/* are served by the Go auth
  // service (server/services/auth) — routed there by NGINX. The monolith only
  // validates sessions via the auth bridge below.

  // Auth: verify the Go-signed assertion locally (no auth_db access).
  initAuth();

  // Setup Service Registry and Event Bus
  const registry = new AppRegistry();
  registry.register("workspaceStorage", workspaceStorage);
  registry.register("teamStorage", teamStorage);
  registry.register("canvasStorage", canvasStorage);

  const context = { registry, eventBus };

  // Apply every domain service's schema migrations BEFORE mounting routes.
  await Promise.all([
    ensureSchema("workspace", workspacePool, workspaceMigrations),
    ensureSchema("team", teamPool, teamMigrations),
    ensureSchema("ai", aiPool, aiMigrations),
    ensureSchema("metrics", metricsPool, metricsMigrations),
  ]);

  // Populate req.user early when a valid assertion cookie exists, then apply
  // the global limiter so authenticated requests can be keyed by user.
  app.use(optionalAuth);
  app.use("/api/", apiLimiter);
  registry.register("isAuthenticated", requireAuth);

  // Initialize Canvas Service (handles nodes and edges) - must listen before WorkspaceService for user.deleted
  CanvasService.initialize(app, context);

  // Initialize Workspace Service (handles collections and workspaces)
  WorkspaceService.initialize(app, context);

  // Initialize AI Service (handles BYOK and free tier AI service)
  AIService.initialize(app, context);

  // Initialize Team Service (handles teams, members, and shared workspaces)
  TeamService.initialize(app, context);

  // Initialize Metrics Service (background collector + history API)
  await MetricsService.initialize(app, context);

  log.info("All modular services initialized");

  return httpServer;
}
