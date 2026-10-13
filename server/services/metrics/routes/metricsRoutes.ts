import type { Express, Request, Response } from "express";
import {
  getMetricsHistory,
  getMetricsSummary,
  cleanupOldSnapshots,
} from "../db/storage";
import { requireAuth } from "../../../auth";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("metrics-routes");

export function registerMetricsRoutes(app: Express) {
  // SECURITY: these endpoints expose system telemetry and a destructive
  // cleanup action — admins only, never regular users, never anonymous.
  function requireAdmin(
    req: Request,
    res: Response,
    next: import("express").NextFunction,
  ) {
    if (!req.user?.isAdmin) {
      return res.status(404).json({ message: "Not Found" });
    }
    next();
  }

  // Query stored metrics history
  app.get(
    "/api/v1/metrics/history",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const limit = Math.min(
          parseInt(req.query.limit as string) || 120,
          1440,
        );
        const rows = await getMetricsHistory(limit);
        res.json(rows);
      } catch (err) {
        log.error({ err }, "Failed to query metrics history");
        res.status(500).json({ message: "Failed to query metrics history" });
      }
    },
  );

  // Summary stats (latest snapshot + aggregates)
  app.get(
    "/api/v1/metrics/summary",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const summary = await getMetricsSummary();
        res.json(summary);
      } catch (err) {
        log.error({ err }, "Failed to query metrics summary");
        res.status(500).json({ message: "Failed to query metrics summary" });
      }
    },
  );

  // Cleanup old snapshots (keep last 7 days) — destructive, admin only.
  app.post(
    "/api/v1/metrics/cleanup",
    requireAuth,
    (req: Request, res: Response, next: import("express").NextFunction) => {
      if (!req.user?.isAdmin) {
        return res
          .status(403)
          .json({ code: "FORBIDDEN", message: "Admin access required" });
      }
      next();
    },
    async (_req: Request, res: Response) => {
      try {
        const deleted = await cleanupOldSnapshots(7);
        res.json({ deleted });
      } catch (err) {
        log.error({ err }, "Failed to cleanup metrics");
        res.status(500).json({ message: "Failed to cleanup metrics" });
      }
    },
  );
}
