import type { Express, Request, Response } from "express";
import {
  getMetricsHistory,
  getMetricsSummary,
  cleanupOldSnapshots,
} from "../db/storage";
import { requireAuth } from "../../../auth";
import { createChildLogger } from "@server/lib/logger";
import { metricsRegistry } from "@server/lib/metrics";
import { internalGet } from "@server/lib/internal";
import { fail } from "@server/lib/errorEnvelope";
import { logTraceback } from "@server/lib/traceback";

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
      return fail(req, res, "NOT_FOUND", "Not Found");
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
        logTraceback(log, "Failed to query metrics history", err, {
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "SERVICE_UNAVAILABLE",
          "Failed to query metrics history",
        );
      }
    },
  );

  // Live aggregate snapshot for the admin dashboard. Same numbers the
  // loopback Prometheus listener serves, but as JSON behind the admin gate
  // (browsers must never touch exposition text directly).
  app.get(
    "/api/v1/metrics/live",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const metrics = await metricsRegistry.getMetricsAsJSON();
        const byName = new Map(metrics.map((m) => [m.name, m.values ?? []]));
        const sumStatus = (prefix: string) => {
          let total = 0;
          for (const v of byName.get("httprequests_total") ?? []) {
            const code = (v.labels as Record<string, string>).status_code ?? "";
            if (code.startsWith(prefix)) total += v.value;
          }
          return total;
        };
        const byEndpoint = new Map<string, { count: number; errors: number }>();
        for (const v of byName.get("httprequests_total") ?? []) {
          const labels = v.labels as Record<string, string>;
          const key = `${labels.method ?? "?"} ${labels.path ?? "?"} ${labels.status_code ?? "?"}`;
          const slot = byEndpoint.get(key) ?? { count: 0, errors: 0 };
          slot.count += v.value;
          if ((labels.status_code ?? "").startsWith("5"))
            slot.errors += v.value;
          byEndpoint.set(key, slot);
        }
        const gauge = (name: string) => {
          const vals = byName.get(name) ?? [];
          return vals.reduce((sum, v) => sum + v.value, 0);
        };
        res.json({
          totalRequests: gauge("httprequests_total"),
          requests2xx: sumStatus("2"),
          requests4xx: sumStatus("4"),
          requests5xx: sumStatus("5"),
          topEndpoints: [...byEndpoint.entries()]
            .map(([route, s]) => ({ route, ...s }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15),
          wsConnections: gauge("websocket_connections_active"),
          wsRooms: gauge("websocket_rooms_active"),
          aiRequests: gauge("ai_chatrequests_total"),
          eventLoopLagMs: gauge("meshwork_eventloop_lag_seconds") * 1000,
          memoryMb: gauge("meshwork_process_resident_memory_bytes") / 1048576,
          startedAt: new Date(
            Date.now() - process.uptime() * 1000,
          ).toISOString(),
          requestId: req.requestId ?? "unscoped",
        });
      } catch (err) {
        logTraceback(log, "Failed to build live metrics", err, {
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "SERVICE_UNAVAILABLE", "Failed to build live metrics");
      }
    },
  );

  // Support-ID lookup: "user quoted ref XXXX-XXXX, what happened?"
  // Proxies the Go audit search (auth_db lives there). Same hex/dash rule
  // as Go; admins only; every hop carries the operator's own request ID.
  app.get(
    "/api/v1/metrics/audit-lookup",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const requestId = req.requestId ?? "unscoped";
      const q = String(req.query.requestId ?? "");
      if (!/^[0-9a-fA-F-]{2,64}$/.test(q)) {
        return fail(
          req,
          res,
          "VALIDATION_FAILED",
          "Give part of a request ID (hex characters and dashes).",
        );
      }
      try {
        const hits = await internalGet<{ hits: unknown[] }>(
          "auth",
          `/internal/audit-search?request_id=${encodeURIComponent(q)}`,
          3000,
          requestId,
        );
        res.json({ ...(hits ?? { hits: [] }), requestId });
      } catch (err) {
        logTraceback(log, "Audit lookup failed", err, { requestId });
        fail(
          req,
          res,
          "AUDIT_UNAVAILABLE",
          "Audit lookup is temporarily unavailable.",
        );
      }
    },
  );

  // Summary stats (latest snapshot + aggregates)
  app.get(
    "/api/v1/metrics/summary",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const summary = await getMetricsSummary();
        res.json(summary);
      } catch (err) {
        logTraceback(log, "Failed to query metrics summary", err, {
          requestId: req.requestId ?? "unscoped",
        });
        fail(
          req,
          res,
          "SERVICE_UNAVAILABLE",
          "Failed to query metrics summary",
        );
      }
    },
  );

  // Cleanup old snapshots (keep last 7 days) — destructive, admin only.
  app.post(
    "/api/v1/metrics/cleanup",
    requireAuth,
    (req: Request, res: Response, next: import("express").NextFunction) => {
      if (!req.user?.isAdmin) {
        return fail(req, res, "FORBIDDEN", "Admin access required");
      }
      next();
    },
    async (req: Request, res: Response) => {
      try {
        const deleted = await cleanupOldSnapshots(7);
        res.json({ deleted });
      } catch (err) {
        logTraceback(log, "Failed to cleanup metrics", err, {
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "SERVICE_UNAVAILABLE", "Failed to cleanup metrics");
      }
    },
  );
}
