import { registerAccountCleanupInternalRoutes } from "./lib/account-cleanup-internal";
import type { Express } from "express";
import type { Server } from "http";
import { initAuth, optionalAuth, requireAuth } from "./auth";
import { ensureSchema } from "./lib/migrate";
import { pool as workspacePool } from "@services/workspace/db/connection";
import { MIGRATIONS as workspaceMigrations } from "@services/workspace/db/migrations";
import { pool as teamPool } from "@services/team/db/connection";
import { MIGRATIONS as teamMigrations } from "@services/team/db/migrations";
import { WorkspaceService } from "@services/workspace";
import { workspaceStorage } from "@services/workspace/db/storage";
import { CanvasService } from "@services/canvas";
import { TeamService } from "@services/team";
import { createChildLogger } from "./lib/logger";
import {
  createWorkspaceSummaryReader,
  createWorkspaceAccessReader,
} from "@services/workspace/public";
import { eventBus } from "./lib/events";
import { apiLimiter } from "./middleware/rateLimit";
import { workspaceAccess } from "./lib/workspace-access";
import { capabilityState, startOptionalCapability } from "./lib/capabilities";
import { requireInternalKey } from "./lib/internal";
import { fail } from "./lib/errorEnvelope";
import type { WebSocketServer } from "ws";

const log = createChildLogger("server");
const optionalStops: (() => Promise<void>)[] = [];
const optionalProbes: Partial<
  Record<"ai" | "metrics", () => Promise<unknown>>
> = {};
async function capabilityHealth(name: "ai" | "metrics"): Promise<string> {
  const probe = optionalProbes[name];
  if (capabilityState[name] !== "ready" || !probe) return capabilityState[name];
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 1500);
      }),
    ]);
    return "ready";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}
let collaboration: WebSocketServer | undefined;
export async function shutdownCollaboration(): Promise<void> {
  const socketServer = collaboration;
  collaboration = undefined;
  if (socketServer) {
    for (const client of socketServer.clients)
      client.close(1001, "Server shutting down");
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  }
}
export async function shutdownRouteResources(): Promise<void> {
  const failures: unknown[] = [];
  for (const stop of optionalStops.splice(0).reverse()) {
    try {
      await stop();
    } catch (error) {
      failures.push(error);
      log.error({ err: error }, "Optional resource shutdown failed");
    }
  }
  capabilityState.ai = "stopped";
  capabilityState.metrics = "stopped";
  if (failures.length)
    throw new AggregateError(failures, "Optional resource shutdown failed");
}

export async function shutdownTeam(): Promise<void> {
  await teamPool.end();
}

export async function shutdownCanvas(): Promise<void> {
  await CanvasService.shutdown();
}

export async function canvasReady(): Promise<boolean> {
  try {
    return await CanvasService.ready();
  } catch (error) {
    log.warn({ err: error }, "Canvas readiness check failed");
    return false;
  }
}

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
  const directAccess = createWorkspaceAccessReader(workspaceStorage);

  // Apply every domain service's schema migrations BEFORE mounting routes.
  await Promise.all([
    ensureSchema("workspace", workspacePool, workspaceMigrations),
    ensureSchema("team", teamPool, teamMigrations),
  ]);

  // Populate req.user early when a valid assertion cookie exists, then apply
  // the global limiter so authenticated requests can be keyed by user.
  app.use(optionalAuth);
  app.use("/api/", apiLimiter);

  // Initialize Canvas Service (handles nodes and edges) - must listen before WorkspaceService for user.deleted
  CanvasService.initialize(app, {
    isAuthenticated: requireAuth,
    workspaces,
    directAccess,
    eventBus,
  });

  // Initialize Workspace Service (handles collections and workspaces)
  WorkspaceService.initialize(app, {
    isAuthenticated: requireAuth,
    directAccess,
    eventBus,
  });

  // Initialize Team Service (handles teams, members, and shared workspaces)
  TeamService.initialize(app, {
    isAuthenticated: requireAuth,
    workspaces,
    directAccess,
    eventBus,
  });

  registerAccountCleanupInternalRoutes(app, eventBus);

  const aiReady = await startOptionalCapability("ai", async () => {
    try {
      const { pool } = await import("@services/ai/db/connection");
      optionalStops.push(() => pool.end());
      optionalProbes.ai = () => pool.query("SELECT 1");
      const { MIGRATIONS } = await import("@services/ai/db/migrations");
      await ensureSchema("ai", pool, MIGRATIONS);
      const { AIService } = await import("@services/ai");
      AIService.initialize(app, { isAuthenticated: requireAuth, eventBus });
    } catch (error) {
      log.error({ err: error }, "AI unavailable during startup");
      throw error;
    }
  });
  if (!aiReady) {
    app.use(["/api/v1/jenkos", "/api/v1/ai"], requireAuth, (req, res) =>
      fail(
        req,
        res,
        "SERVICE_UNAVAILABLE",
        "AI service is temporarily unavailable",
      ),
    );
  }
  const metricsReady = await startOptionalCapability("metrics", async () => {
    try {
      const { pool } = await import("@services/metrics/db/connection");
      optionalStops.push(() => pool.end());
      optionalProbes.metrics = () => pool.query("SELECT 1");
      const { MIGRATIONS } = await import("@services/metrics/db/migrations");
      await ensureSchema("metrics", pool, MIGRATIONS);
      const { MetricsService } = await import("@services/metrics");
      await MetricsService.initialize(app);
      optionalStops.push(() => MetricsService.shutdown());
    } catch (error) {
      log.error({ err: error }, "Metrics unavailable during startup");
      throw error;
    }
  });
  if (!metricsReady) {
    app.use("/api/v1/metrics", requireAuth, (req, res) => {
      if (!req.user?.isAdmin) return fail(req, res, "NOT_FOUND", "Not Found");
      return fail(
        req,
        res,
        "SERVICE_UNAVAILABLE",
        "Metrics service is temporarily unavailable",
      );
    });
  }
  app.get(
    "/internal/v1/capabilities",
    requireInternalKey,
    async (_req, res) => {
      const [ai, metrics, canvas] = await Promise.all([
        capabilityHealth("ai"),
        capabilityHealth("metrics"),
        canvasReady(),
      ]);
      res.json({ ai, metrics, canvas: canvas ? "ready" : "unavailable" });
    },
  );

  const { initializeWebSocket } =
    await import("@services/collaboration/websocket");
  collaboration = initializeWebSocket(
    httpServer,
    workspaceAccess(directAccess),
  );
  log.info("All modular services initialized");

  return httpServer;
}
