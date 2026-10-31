import { queryMetricsCounts, insertSnapshot } from "../db/storage";
import { metricsRegistry } from "@server/lib/metrics";
import { createChildLogger } from "@server/lib/logger";
import {
  intervalMeanMs,
  readDurationHistogram,
  type HistogramSnapshot,
} from "./duration";

const log = createChildLogger("metrics-collector");

let previousRequests = 0;
let previousAiRequests = 0;
let previousDurations: HistogramSnapshot = new Map();
let collectorRunning = false;
let collectorTimer: NodeJS.Timeout | undefined;
let activeSnapshot: Promise<void> | undefined;

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
    const requestRate =
      totalReqs >= previousRequests ? totalReqs - previousRequests : totalReqs;

    const durations = readDurationHistogram(metrics);
    const avgDurationMs = intervalMeanMs(durations, previousDurations);

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
    const aiRate =
      totalAi >= previousAiRequests ? totalAi - previousAiRequests : totalAi;

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
      totalUsers: c.total_users,
      newUsersToday: c.new_users_today,
      activeUsers24h: c.active_users_24h,
      loginsToday: c.logins_today,
      totalWorkspaces: c.total_workspaces,
      totalTeams: c.total_teams,
    });

    previousRequests = totalReqs;
    previousAiRequests = totalAi;
    previousDurations = durations;

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
  const tick = () => {
    if (!collectorRunning || activeSnapshot) return;
    activeSnapshot = snapshotMetrics().finally(() => {
      activeSnapshot = undefined;
    });
  };
  collectorTimer = setInterval(tick, intervalMs);
  log.info({ intervalMs }, "Metrics collector started");
}

export async function stopCollector(): Promise<void> {
  collectorRunning = false;
  if (collectorTimer) clearInterval(collectorTimer);
  collectorTimer = undefined;
  await activeSnapshot;
}
