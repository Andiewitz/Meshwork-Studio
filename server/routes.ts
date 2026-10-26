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
import { WorkspaceService } from "@services/workspace";
import { workspaceStorage } from "@services/workspace/db/storage";
import { CanvasService } from "@services/canvas";
import { AIService } from "@services/ai";
import { TeamService } from "@services/team";
import { teamStorage } from "@services/team/db/storage";
import { MetricsService } from "@services/metrics";
import { createChildLogger } from "./lib/logger";
import { createWorkspaceSummaryReader } from "@services/workspace/public";
import { createTeamWorkspaceAccess } from "@services/team/public";
import { eventBus } from "./lib/events";

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

  // Only the composition root sees private implementations. Consumers receive
  // projected, read-only capabilities rather than each other's repositories.
  const workspaces = createWorkspaceSummaryReader(workspaceStorage);
  const teamAccess = createTeamWorkspaceAccess(teamStorage);

  // Apply every domain service's schema migrations BEFORE mounting routes.
  await Promise.all([
    ensureSchema("workspace", workspacePool, workspaceMigrations),
    ensureSchema("team", teamPool, teamMigrations),
    ensureSchema("ai", aiPool, aiMigrations),
    ensureSchema("metrics", metricsPool, metricsMigrations),
  ]);

  // Populate req.user early when a valid assertion cookie exists
  app.use(optionalAuth);

  // Initialize Canvas Service (handles nodes and edges) - must listen before WorkspaceService for user.deleted
  CanvasService.initialize(app, {
    isAuthenticated: requireAuth,
    workspaces,
    teamAccess,
    eventBus,
  });

  // Initialize Workspace Service (handles collections and workspaces)
  WorkspaceService.initialize(app, {
    isAuthenticated: requireAuth,
    teamAccess,
    eventBus,
  });

  // Initialize AI Service (handles BYOK and free tier AI service)
  AIService.initialize(app, { isAuthenticated: requireAuth });

  // Initialize Team Service (handles teams, members, and shared workspaces)
  TeamService.initialize(app, {
    isAuthenticated: requireAuth,
    workspaces,
    eventBus,
  });

  // Initialize Metrics Service (background collector + history API)
  await MetricsService.initialize(app);

  log.info("All modular services initialized");

  return httpServer;
}
