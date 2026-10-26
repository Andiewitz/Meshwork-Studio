import { pool } from "./connection";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getIdentityStats } from "@server/auth/internal-client";
import { internalGet, InternalCallError } from "@server/lib/internal";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("metrics-counts");
const count = z.number().int().nonnegative();
const workspaceStatsSchema = z.object({ totalWorkspaces: count });
const teamStatsSchema = z.object({ totalTeams: count });

export interface MetricCounts {
  total_users: number | null;
  new_users_today: number | null;
  active_users_24h: number | null;
  logins_today: number | null;
  total_workspaces: number | null;
  total_teams: number | null;
}

// Keep partial collection useful without inventing values for unavailable
// sources. A NULL domain count is a gap; a validated zero is a real sample.
async function availableCount<T>(
  service: string,
  requestId: string,
  load: () => Promise<T>,
): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    log.warn(
      {
        service,
        requestId,
        reason:
          error instanceof InternalCallError ? error.reason : "unexpected",
        upstreamStatus:
          error instanceof InternalCallError ? error.upstreamStatus : undefined,
      },
      "Domain metrics unavailable; storing a gap",
    );
    return null;
  }
}

export async function queryMetricsCounts(
  requestId: string = randomUUID(),
): Promise<MetricCounts> {
  const options = { requestId };
  const [auth, workspace, team] = await Promise.all([
    availableCount("auth", requestId, () => getIdentityStats(options)),
    availableCount("workspace", requestId, () =>
      internalGet(
        "workspace",
        "/internal/v1/workspace/stats",
        workspaceStatsSchema,
        options,
      ),
    ),
    availableCount("team", requestId, () =>
      internalGet("team", "/internal/v1/team/stats", teamStatsSchema, options),
    ),
  ]);

  return {
    total_users: auth?.totalUsers ?? null,
    new_users_today: auth?.newUsersToday ?? null,
    active_users_24h: auth?.activeUsers24h ?? null,
    logins_today: auth?.loginsToday ?? null,
    total_workspaces: workspace?.totalWorkspaces ?? null,
    total_teams: team?.totalTeams ?? null,
  };
}

export async function insertSnapshot(values: {
  totalRequests: number;
  requestRate: number;
  avgDurationMs: number;
  memoryMb: number;
  cpuSeconds: number;
  eventLoopLagMs: number;
  wsConnections: number;
  wsRooms: number;
  aiRequests: number;
  totalUsers: number | null;
  newUsersToday: number | null;
  activeUsers24h: number | null;
  loginsToday: number | null;
  totalWorkspaces: number | null;
  totalTeams: number | null;
}) {
  await pool.query(
    `INSERT INTO metrics_snapshots
      (captured_at, total_requests, request_rate, avg_duration_ms, memory_mb, cpu_seconds, event_loop_lag_ms, ws_connections, ws_rooms, ai_requests, total_users, new_users_today, active_users_24h, logins_today, total_workspaces, total_teams)
     VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      values.totalRequests,
      values.requestRate,
      Math.round(values.avgDurationMs * 100) / 100,
      Math.round(values.memoryMb * 10) / 10,
      Math.round(values.cpuSeconds * 100) / 100,
      Math.round(values.eventLoopLagMs * 10) / 10,
      values.wsConnections,
      values.wsRooms,
      values.aiRequests,
      values.totalUsers,
      values.newUsersToday,
      values.activeUsers24h,
      values.loginsToday,
      values.totalWorkspaces,
      values.totalTeams,
    ],
  );
}

export async function getMetricsHistory(limit: number) {
  const result = await pool.query(
    `SELECT
       captured_at as "capturedAt",
       total_requests as "totalRequests",
       request_rate as "requestRate",
       avg_duration_ms as "avgDurationMs",
       memory_mb as "memoryMb",
       cpu_seconds as "cpuSeconds",
       event_loop_lag_ms as "eventLoopLagMs",
       ws_connections as "wsConnections",
       ws_rooms as "wsRooms",
       ai_requests as "aiRequests",
       total_users as "totalUsers",
       new_users_today as "newUsersToday",
       active_users_24h as "activeUsers24h",
       logins_today as "loginsToday",
       total_workspaces as "totalWorkspaces",
       total_teams as "totalTeams"
     FROM metrics_snapshots
     ORDER BY captured_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.reverse();
}

export async function getMetricsSummary() {
  const result = await pool.query(`
    SELECT
      (SELECT captured_at FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "capturedAt",
      (SELECT total_requests FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "totalRequests",
      (SELECT SUM(request_rate) FROM metrics_snapshots WHERE captured_at > NOW() - INTERVAL '1 hour') as "requestsLastHour",
      (SELECT AVG(avg_duration_ms) FROM metrics_snapshots WHERE captured_at > NOW() - INTERVAL '1 hour') as "avgDurationLastHour",
      (SELECT AVG(memory_mb) FROM metrics_snapshots WHERE captured_at > NOW() - INTERVAL '1 hour') as "avgMemoryLastHour",
      (SELECT MAX(event_loop_lag_ms) FROM metrics_snapshots WHERE captured_at > NOW() - INTERVAL '1 hour') as "maxLagLastHour",
      (SELECT SUM(ai_requests) FROM metrics_snapshots WHERE captured_at > NOW() - INTERVAL '1 hour') as "aiRequestsLastHour",
      (SELECT COUNT(*) FROM metrics_snapshots) as "totalSnapshots",
      (SELECT MIN(captured_at) FROM metrics_snapshots) as "firstSnapshot",
      (SELECT MAX(captured_at) FROM metrics_snapshots) as "lastSnapshot",
      (SELECT total_users FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "totalUsers",
      (SELECT new_users_today FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "newUsersToday",
      (SELECT active_users_24h FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "activeUsers24h",
      (SELECT logins_today FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "loginsToday",
      (SELECT total_workspaces FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "totalWorkspaces",
      (SELECT total_teams FROM metrics_snapshots ORDER BY captured_at DESC LIMIT 1) as "totalTeams"
  `);
  return result.rows[0];
}

export async function cleanupOldSnapshots(days = 7) {
  const result = await pool.query(
    `DELETE FROM metrics_snapshots WHERE captured_at < NOW() - INTERVAL '${days} days'`,
  );
  return result.rowCount ?? 0;
}
