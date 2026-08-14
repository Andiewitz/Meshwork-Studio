import type { Express, Request, Response } from "express";
import {
  getMetricsHistory,
  getMetricsSummary,
  cleanupOldSnapshots,
} from "../db/storage";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("metrics-routes");

export function registerMetricsRoutes(app: Express) {
  // Query stored metrics history
  app.get("/api/v1/metrics/history", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 120, 1440);
      const rows = await getMetricsHistory(limit);
      res.json(rows);
    } catch (err) {
      log.error({ err }, "Failed to query metrics history");
      res.status(500).json({ message: "Failed to query metrics history" });
    }
  });

  // Summary stats (latest snapshot + aggregates)
  app.get("/api/v1/metrics/summary", async (_req: Request, res: Response) => {
    try {
      const summary = await getMetricsSummary();
      res.json(summary);
    } catch (err) {
      log.error({ err }, "Failed to query metrics summary");
      res.status(500).json({ message: "Failed to query metrics summary" });
    }
  });

  // Cleanup old snapshots (keep last 7 days)
  app.post("/api/v1/metrics/cleanup", async (_req: Request, res: Response) => {
    try {
      const deleted = await cleanupOldSnapshots(7);
      res.json({ deleted });
    } catch (err) {
      log.error({ err }, "Failed to cleanup metrics");
      res.status(500).json({ message: "Failed to cleanup metrics" });
    }
  });
}
