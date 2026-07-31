import "dotenv/config";
import { logger, createChildLogger } from "./lib/logger";
const log = createChildLogger("server");
log.info("Starting initialization phase 0...");
import express, { type Request, Response, NextFunction } from "express";
import { db } from "./lib/db";
import { sql } from "drizzle-orm";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {
  csrfProtection,
  generateCsrfToken,
  validateCsrfToken,
} from "./middleware/csrf";
import { apiLimiter } from "./middleware/rateLimit";
import { isRedisAvailable } from "./lib/redis";
import { metricsMiddleware } from "./middleware/metricsMiddleware";
import { metricsRegistry } from "./lib/metrics";
import path from "path";
import fs from "fs";

let isAppReady = false;

const app = express();
const httpServer = createServer(app);

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

// Real Health Check endpoint
app.get("/health", async (_req, res) => {
  try {
    const checks = {
      postgres: false,
      redis: false,
    };

    // Check Postgres
    try {
      await db.execute(sql`SELECT 1`);
      checks.postgres = true;
    } catch (err) {
      log.error({ err }, "Postgres health check failed");
    }

    // Check Redis
    checks.redis = await isRedisAvailable();

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
app.get("/ready", (_req, res) => {
  if (isAppReady) {
    res
      .status(200)
      .json({ status: "ready", timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ status: "not_ready" });
  }
});

// Prometheus Metrics Endpoint
app.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.send(metrics);
  } catch (err) {
    log.error({ err }, "Metrics endpoint error");
    res.status(500).send("Error generating metrics");
  }
});

// Admin Metrics Dashboard — secret URL, never exposed in logs/sitemaps
const adminSecret = process.env.ADMIN_SECRET || "";
app.get("/admin/:secret", (req, res) => {
  if (!adminSecret || req.params.secret !== adminSecret) {
    return res.status(404).send("Not Found");
  }
  try {
    const htmlPath = path.resolve(__dirname, "admin.html");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(htmlPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      res.type("html").send(fs.readFileSync(htmlPath, "utf-8"));
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  } catch (err) {
    res.status(500).send("Error loading dashboard");
  }
});

(async () => {
  const port = parseInt(process.env.PORT || "5000", 10);

  // Start listening BEFORE expensive initialization to pass healthchecks early.
  // Port 0.0.0.0 is required for EC2/Docker.
  httpServer.listen(port, "0.0.0.0", () => {
    log.info(
      `Server started listening on port ${port} (initializing modules...)`,
    );
  });

  try {
    log.info("Starting database migrations...");
    try {
      await db.execute(
        sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP`,
      );
      await db.execute(
        sql`UPDATE workspaces SET updated_at = created_at WHERE updated_at > '2026-04-19 07:00:00' AND updated_at < '2026-04-19 08:30:00' AND created_at < '2026-04-19 07:00:00'`,
      );
      log.info("Database migrations applied successfully");
    } catch (dbErr) {
      log.warn(
        { err: dbErr },
        "Failed to apply DB migrations, might already exist or DB is unavailable",
      );
    }

    log.info("Starting module initialization...");
    await registerRoutes(httpServer, app);
    log.info("All modules initialized successfully");

    // Initialize WebSocket presence server for real-time cursors
    const { initializeWebSocket } = await import("./modules/team/websocket");
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

    isAppReady = true;
    log.info(`Server fully ready and serving on port ${port}`);
  } catch (error) {
    console.error("CRITICAL FAILURE:", error);
    log.fatal({ err: error }, "CRITICAL FAILURE DURING SERVER INITIALIZATION");
    log.error(
      "The server is still listening on /health but other routes may be broken.",
    );
  }

  // Serve static files LAST so the SPA catch-all doesn't swallow API routes.
  // Runs outside the try/catch so frontend always loads even if modules fail.
  if (process.env.NODE_ENV === "production") {
    log.info("Serving static frontend files from /public");
    serveStatic(app);
  }
})();
