import "dotenv/config";
import { logger, createChildLogger } from "./lib/logger";
const log = createChildLogger("server");
log.info("Starting initialization phase 0...");

import express, { type Request, Response, NextFunction } from "express";
import {
  db as workspaceDb,
  pool as workspacePool,
} from "./services/workspace/db/connection";
import { sql } from "drizzle-orm";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer, request as httpRequest } from "http";
import { requireAuth } from "./auth";
import { WorkspaceService } from "@services/workspace";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { apiLimiter } from "./middleware/rateLimit";
import { disconnectRedis, isRedisAvailable } from "./lib/redis";
import { metricsMiddleware } from "./middleware/metricsMiddleware";
import { metricsRegistry } from "./lib/metrics";
import path from "path";
import { fileURLToPath } from "url";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : typeof import.meta !== "undefined" && import.meta.url
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();
import fs from "fs";

let isAppReady = false;
let isShuttingDown = false;

const app = express();
const httpServer = createServer(app);

async function closeHttpServer(): Promise<void> {
  await new Promise<void>((resolve) => {
    httpServer.close((err) => {
      if (
        err &&
        (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
      ) {
        log.warn({ err }, "HTTP server did not close cleanly");
      }
      resolve();
    });
  });
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  isAppReady = false;
  log.info({ reason }, "Starting graceful shutdown");
  const forceTimer = setTimeout(() => {
    log.error({ reason }, "Graceful shutdown timed out");
    process.exit(exitCode || 1);
  }, 15_000);
  forceTimer.unref();
  await closeHttpServer();
  WorkspaceService.shutdown();
  await Promise.allSettled([disconnectRedis(), workspacePool.end()]);
  log.info({ reason }, "Graceful shutdown complete");
  process.exit(exitCode);
}

process.once("SIGTERM", () => void shutdown("SIGTERM", 0));
process.once("SIGINT", () => void shutdown("SIGINT", 0));
process.once("uncaughtException", (err) => {
  log.fatal({ err }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", (reason) => {
  log.fatal({ err: reason }, "Unhandled rejection");
  void shutdown("unhandledRejection", 1);
});

// SECURITY: Trust the NGINX reverse proxy so rate limiting works per user IP, not proxy IP
app.set("trust proxy", 1);

// SECURITY: Apply global rate limiting to all API routes
app.use("/api/", apiLimiter);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// CORS / CSP need frontendUrl — declare it first
const frontendUrl =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");

// SECURITY: Add security headers with CSP for external resources
const cspConfig = {
  directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "https://www.google.com",
      "https://www.gstatic.com",
      "https://cdn.jsdelivr.net",
    ],
    "frame-src": [
      "'self'",
      "https://www.google.com",
      "https://recaptcha.google.com",
    ],
    "connect-src": [
      "'self'",
      frontendUrl,
      "https://www.google.com",
      "https://www.gstatic.com",
    ],
    "img-src": [
      "'self'",
      "data:",
      "https://www.gstatic.com",
      "https://*.googleusercontent.com",
      "https://lh3.googleusercontent.com",
      "https://lh4.googleusercontent.com",
      "https://lh5.googleusercontent.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
  },
};

if (process.env.NODE_ENV === "production") {
  app.use(
    helmet({
      contentSecurityPolicy: cspConfig,
    }),
  );
} else {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...cspConfig.directives,
          "script-src": [
            "'self'",
            "'unsafe-inline'",
            "localhost",
            "https://www.google.com",
            "https://www.gstatic.com",
          ],
          "connect-src": [
            "'self'",
            "localhost:*",
            "ws://localhost:*",
            "https://www.google.com",
            "https://www.gstatic.com",
          ],
        },
      },
    }),
  );
}

// CORS configuration (for all environments)
if (frontendUrl) {
  app.use(
    cors({
      origin: frontendUrl,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    }),
  );
} else if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: true, credentials: true }));
}

// API Versioning Compatibility Layer
app.use((req, res, next) => {
  if (req.url.startsWith("/api/") && !req.url.startsWith("/api/v1/")) {
    req.url = req.url.replace("/api/", "/api/v1/");
  }
  next();
});

// DEV ONLY: proxy the Go auth service surface. In production NGINX routes
// these paths straight to :8081 and Express never sees them; locally there
// is no NGINX, so mirror that split here. Registered BEFORE body parsers so
// requests stream through untouched (cookies + raw body preserved).
if (process.env.NODE_ENV !== "production") {
  const AUTH_UPSTREAM_HOST = process.env.AUTH_DEV_HOST || "127.0.0.1";
  const AUTH_UPSTREAM_PORT = process.env.AUTH_DEV_PORT || "8081";
  app.use((req, res, next) => {
    if (!/^\/api\/v1\/(auth|user)\//.test(req.url)) return next();

    const upstream = httpRequest(
      {
        host: AUTH_UPSTREAM_HOST,
        port: AUTH_UPSTREAM_PORT,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${AUTH_UPSTREAM_HOST}:${AUTH_UPSTREAM_PORT}`,
        },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode || 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.status(502).json({
        code: "AUTH_SERVICE_UNAVAILABLE",
        message:
          "Auth service is not running. Start it with: make -C server/services/auth run",
      });
    });
    req.pipe(upstream);
  });
}

// SECURITY: Add request size limits to prevent DoS
app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "5mb" }));

// Prometheus metrics middleware
app.use(metricsMiddleware);

// SECURITY: CSRF Protection - Setup cookie parser before CSRF middleware
app.use(cookieParser());

// Note: CSRF protection is applied per-route in auth routes,
// not globally, because it needs session middleware to be initialized first.
// Session middleware is initialized by setupAuth() in registerRoutes()

async function dependencyChecks() {
  const checks = { postgres: false, redis: false };
  try {
    await workspaceDb.execute(sql`SELECT 1`);
    checks.postgres = true;
  } catch (err) {
    log.error({ err }, "Postgres health check failed");
  }
  checks.redis = await isRedisAvailable();
  return checks;
}

// Liveness intentionally makes no downstream call; readiness is below.
app.get("/live", (_req, res) => {
  res.status(200).json({ status: "live" });
});

// Real Health Check endpoint
app.get(["/health", "/healthz"], async (_req, res) => {
  try {
    const checks = await dependencyChecks();

    const isHealthy =
      checks.postgres && (!process.env.REDIS_URL || checks.redis);
    const status = isHealthy ? "healthy" : "degraded";
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
    });
  } catch (err) {
    log.error({ err }, "Health check endpoint error");
    res
      .status(500)
      .json({ status: "error", message: "Internal health check error" });
  }
});

// Readiness Probe
app.get("/ready", async (_req, res) => {
  const checks = await dependencyChecks();
  const ready =
    isAppReady && checks.postgres && (!process.env.REDIS_URL || checks.redis);
  if (ready) {
    res
      .status(200)
      .json({ status: "ready", timestamp: new Date().toISOString(), checks });
  } else {
    res.status(503).json({ status: "not_ready", checks });
  }
});

// SECURITY: Prometheus metrics require a bearer token (constant-time
// compare). Scrape configs set `Authorization: Bearer <METRICS_BEARER_TOKEN>`.
// When the token is unset the endpoint 404s entirely.
const metricsBearer = process.env.METRICS_BEARER_TOKEN || "";
app.get("/metrics", async (req, res) => {
  if (
    !metricsBearer ||
    req.headers.authorization !== `Bearer ${metricsBearer}`
  ) {
    return res.status(404).send("Not Found");
  }
  try {
    res.set("Content-Type", metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.send(metrics);
  } catch (err) {
    log.error({ err }, "Metrics endpoint error");
    res.status(500).send("Error generating metrics");
  }
});

// Admin dashboard: session-authenticated admin users only. The old
// secret-in-URL gate leaked via logs/history/Referer and had no authz.
const adminHtmlPath = path.resolve(moduleDir, "admin.html");
app.get("/admin", requireAuth, (_req, res) => {
  const user = (_req as { user?: { isAdmin?: boolean } }).user;
  if (!user?.isAdmin) {
    return res.status(404).send("Not Found");
  }
  try {
    if (fs.existsSync(adminHtmlPath)) {
      res.type("html").send(fs.readFileSync(adminHtmlPath, "utf-8"));
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  } catch (err) {
    log.error({ err }, "Admin dashboard load failed");
    res.status(500).send("Error loading dashboard");
  }
});

(async () => {
  const port = parseInt(process.env.PORT || "5000", 10);

  try {
    // Database schema is owned per-service: server/services/<svc>/db/migrations
    // is applied by each service during registerRoutes. Nothing here.

    log.info("Starting module initialization...");
    await registerRoutes(httpServer, app);
    log.info("All modules initialized successfully");

    // Initialize WebSocket presence server for real-time cursors
    const { initializeWebSocket } = await import("@services/team/websocket");
    initializeWebSocket(httpServer);
    log.info("WebSocket presence server initialized");

    // Importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV !== "production") {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // Global error handler — MUST be registered AFTER all routes
    app.use(
      (err: unknown, _req: Request, res: Response, next: NextFunction) => {
        const httpErr = err as {
          status?: number;
          statusCode?: number;
          message?: string;
          code?: string;
        };
        const status = httpErr.status ?? httpErr.statusCode ?? 500;

        log.error({ err, status }, "Unhandled error reached global handler");

        if (res.headersSent) {
          return next(err);
        }

        // Handle Postgres database constraint errors
        if (httpErr.code === "23505") {
          return res.status(400).json({
            message:
              "A record with this value already exists. Please use a unique value.",
          });
        }
        if (httpErr.code === "23503") {
          return res.status(400).json({
            message: "Referenced record does not exist or cannot be deleted.",
          });
        }
        if (httpErr.code === "22P02") {
          return res
            .status(400)
            .json({ message: "Invalid data format provided." });
        }

        // SECURITY: Never forward raw error messages to clients in production
        const clientMessage =
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : (httpErr.message ?? "Internal Server Error");

        return res.status(status).json({ message: clientMessage });
      },
    );

    // Serve static files LAST so the SPA catch-all doesn't swallow API routes.
    if (process.env.NODE_ENV === "production") {
      log.info("Serving static frontend files from /public");
      serveStatic(app);
    }

    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, "0.0.0.0", () => {
        httpServer.off("error", reject);
        resolve();
      });
    });
    isAppReady = true;
    log.info(`Server fully ready and serving on port ${port}`);
  } catch (error) {
    log.fatal({ err: error }, "CRITICAL FAILURE DURING SERVER INITIALIZATION");
    await shutdown("initialization failure", 1);
  }
})();
