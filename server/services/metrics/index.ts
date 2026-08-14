import type { Express } from "express";
import type { AppContext } from "@server/lib/registry";
import { createMetricsTable } from "./db/connection";
import { startCollector } from "./collector/collector";
import { registerMetricsRoutes } from "./routes/metricsRoutes";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("metrics-service");

export class MetricsService {
  static async initialize(app: Express, _context: AppContext) {
    try {
      await createMetricsTable();
      startCollector(30000);
    } catch (err) {
      log.warn(
        { err },
        "Failed to initialize metrics table, skipping collector",
      );
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
