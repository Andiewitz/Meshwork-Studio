import { queryMetricsCounts, insertSnapshot } from "../db/storage";
import { metricsRegistry } from "@server/lib/metrics";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("metrics-collector");

let previousRequests = 0;
let previousAiRequests = 0;
let collectorRunning = false;

function parsePrometheusValue(metrics: string, name: string): number {
  let total = 0;
  for (const line of metrics.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    if (line.startsWith(name + "{")) {
      const match = /\}\s+([\d.eE+-]+)$/.exec(line);
      if (match) total += parseFloat(match[1]);
    } else if (line.startsWith(name + " ")) {
      const match = /\s+([\d.eE+-]+)$/.exec(line);
      if (match) total += parseFloat(match[1]);
    }
  }
  return total;
}

export async function snapshotMetrics() {
  try {
    const metrics = await metricsRegistry.metrics();

    const totalReqs = parsePrometheusValue(metrics, "http_requests_total");
    const requestRate = totalReqs - previousRequests;
    previousRequests = totalReqs;

    let totalDuration = 0;
    let totalCount = 0;
    for (const line of metrics.split("\n")) {
      if (line.startsWith("http_request_duration_seconds_bucket")) {
        const bucketMatch = /le="([^"]+)"/.exec(line);
        const countMatch = /\}\s+([\d.eE+-]+)$/.exec(line);
        if (bucketMatch && countMatch) {
          totalCount += parseFloat(countMatch[1]);
        }
      } else if (line.startsWith("http_request_duration_seconds_sum")) {
        const match = /\s+([\d.eE+-]+)$/.exec(line);
        if (match) totalDuration = parseFloat(match[1]);
      }
    }
    const avgDurationMs =
      totalCount > 0 ? (totalDuration / totalCount) * 1000 : 0;

    const memoryMb =
      parsePrometheusValue(metrics, "meshwork_process_resident_memory_bytes") /
      (1024 * 1024);
    const cpuSeconds = parsePrometheusValue(
      metrics,
      "meshwork_process_cpu_user_seconds_total",
    );
    const eventLoopLagMs =
      parsePrometheusValue(metrics, "meshwork_eventloop_lag_seconds") * 1000;
    const wsConnections = parsePrometheusValue(
      metrics,
      "websocket_connections_active",
    );
    const wsRooms = parsePrometheusValue(metrics, "websocket_rooms_active");

    const totalAi = parsePrometheusValue(metrics, "ai_chat_requests_total");
    const aiRate = totalAi - previousAiRequests;
    previousAiRequests = totalAi;

    const c = await queryMetricsCounts();

    await insertSnapshot({
      totalRequests: totalReqs,
      requestRate,
      avgDurationMs,
      memoryMb,
      cpuSeconds,
      eventLoopLagMs,
      wsConnections,
      wsRooms,
      aiRequests: aiRate,
      totalUsers: Number(c.total_users ?? 0),
      newUsersToday: Number(c.new_users_today ?? 0),
      activeUsers24h: Number(c.active_users_24h ?? 0),
      loginsToday: Number(c.logins_today ?? 0),
      totalWorkspaces: Number(c.total_workspaces ?? 0),
      totalTeams: Number(c.total_teams ?? 0),
    });

    log.debug(
      {
        totalReqs,
        requestRate,
        totalUsers: c.total_users,
        activeUsers24h: c.active_users_24h,
      },
      "Metrics snapshot saved",
    );
  } catch (err: unknown) {
    log.error({ err }, "Failed to snapshot metrics");
  }
}

export function startCollector(intervalMs = 30000) {
  if (collectorRunning) return;
  collectorRunning = true;

  setTimeout(() => {
    void snapshotMetrics();
    setInterval(() => {
      void snapshotMetrics();
    }, intervalMs);
  }, intervalMs);

  log.info({ intervalMs }, "Metrics collector started");
}
