import {
  pgTable,
  serial,
  timestamp,
  integer,
  index,
  real,
} from "drizzle-orm/pg-core";

export const metricsSnapshots = pgTable(
  "metrics_snapshots",
  {
    id: serial("id").primaryKey(),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
    totalRequests: real("total_requests").notNull().default(0),
    requestRate: real("request_rate").notNull().default(0),
    avgDurationMs: real("avg_duration_ms").notNull().default(0),
    memoryMb: real("memory_mb").notNull().default(0),
    cpuSeconds: real("cpu_seconds").notNull().default(0),
    eventLoopLagMs: real("event_loop_lag_ms").notNull().default(0),
    wsConnections: integer("ws_connections").notNull().default(0),
    wsRooms: integer("ws_rooms").notNull().default(0),
    aiRequests: real("ai_requests").notNull().default(0),
    totalUsers: integer("total_users").notNull().default(0),
    newUsersToday: integer("new_users_today").notNull().default(0),
    activeUsers24h: integer("active_users_24h").notNull().default(0),
    loginsToday: integer("logins_today").notNull().default(0),
    totalWorkspaces: integer("total_workspaces").notNull().default(0),
    totalTeams: integer("total_teams").notNull().default(0),
  },
  (table) => [index("IDX_metrics_snapshots_captured_at").on(table.capturedAt)],
);
