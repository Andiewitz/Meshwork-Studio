import type { Request, Response, NextFunction } from "express";
import { httpRequestsTotal, httpRequestDurationSeconds } from "../lib/metrics";

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Ignore the metrics and health endpoints to prevent noise
  if (
    req.path === "/metrics" ||
    req.path === "/health" ||
    req.path === "/healthz" ||
    req.path === "/ready"
  ) {
    return next();
  }

  const start = process.hrtime();

  res.on("finish", () => {
    const duration = process.hrtime(start);
    const durationInSeconds = duration[0] + duration[1] / 1e9;

    // Use a simplified path for metrics to avoid high cardinality
    // E.g. /api/workspace/123 -> /api/workspace/:id
    let path = req.route ? req.baseUrl + req.route.path : req.path;

    if (!path || path === "/") path = "root";

    httpRequestsTotal.labels(req.method, path, res.statusCode.toString()).inc();
    httpRequestDurationSeconds
      .labels(req.method, path)
      .observe(durationInSeconds);
  });

  next();
}
