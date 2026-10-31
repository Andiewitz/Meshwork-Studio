import type { Express } from "express";
import { startCollector, stopCollector } from "./collector/collector";
import { registerMetricsRoutes } from "./routes/metricsRoutes";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("metrics-service");

export class MetricsService {
  static async initialize(app: Express) {
    registerMetricsRoutes(app);
    startCollector(30000);

    log.info("Metrics service initialized");
  }
  static async shutdown() {
    await stopCollector();
  }
}

// Backward compatibility alias
export const MetricsModule = MetricsService;
