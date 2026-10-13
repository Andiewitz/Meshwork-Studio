import { createServer, type Server } from "http";
import { metricsRegistry } from "./metrics";
import { logger } from "./logger";

const log = logger.child({ module: "metrics-server" });

const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"];

/**
 * Prometheus exposition on loopback ONLY (default 127.0.0.1:9090, override
 * with METRICS_PORT/METRICS_HOST). No route, no token: reachability is the
 * credential, and only this box plus SSH tunnels (`-L 9090:127.0.0.1:9090`)
 * can reach it. Throws on a non-loopback host so boot fails closed instead
 * of silently exposing metrics.
 */
export function startMetricsServer(
  host = process.env.METRICS_HOST || "127.0.0.1",
  port = Number(process.env.METRICS_PORT || "9090"),
): Server {
  if (!LOOPBACK_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to expose Prometheus metrics on non-loopback address: ${host}`,
    );
  }
  const server = createServer(async (_req, res) => {
    try {
      res.setHeader("Content-Type", metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (err) {
      log.error({ err }, "Loopback metrics error");
      res.statusCode = 500;
      res.end("Error generating metrics");
    }
  });
  server.listen(port, host, () => {
    log.info(
      `Prometheus metrics on loopback ${host}:${port} (no public route)`,
    );
  });
  return server;
}
