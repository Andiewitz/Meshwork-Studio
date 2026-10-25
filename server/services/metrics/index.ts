import type { Express } from "express";
import type { AppContext } from "@server/lib/registry";
import { ensureSchema } from "@server/lib/migrate";
import { MIGRATIONS } from "./db/migrations";
import { pool } from "./db/connection";
import { startCollector } from "./collector/collector";
import { registerMetricsRoutes } from "./routes/metricsRoutes";
import { createChildLogger } from "@server/lib/logger";
import { logTraceback } from "@server/lib/traceback";

const log = createChildLogger("metrics-service");

export class MetricsService {
  static async initialize(app: Express, _context: AppContext) {
    try {
      await ensureSchema("metrics", pool, MIGRATIONS);
      startCollector(30000);
    } catch (err) {
      logTraceback(
        log,
        "Metrics schema migration failed — collector disabled",
        err,
      );
      throw err;
    }

    registerMetricsRoutes(app);

    log.info("Metrics service initialized");
  }
}

// Backward compatibility alias
export const MetricsModule = MetricsService;

export * from "./db";
export * from "./collector";
export * from "./routes";
