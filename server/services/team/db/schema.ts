import {
  pgTable,
  timestamp,
  integer,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { users } from "@services/auth/db/schema";
import { workspaces } from "@services/workspace/db/schema";

export const teams = pgTable(
  "teams",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 64 }).notNull(),
    inviteCode: varchar("invite_code", { length: 8 }).unique().notNull(),
    ownerId: varchar("owner_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_teams_invite_code").on(table.inviteCode),
    index("IDX_teams_owner_id").on(table.ownerId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    teamId: varchar("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull().default("editor"),
    color: varchar("color", { length: 7 }).notNull(),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => [
    index("IDX_team_members_team_id").on(table.teamId),
    index("IDX_team_members_user_id").on(table.userId),
    uniqueIndex("UQ_team_members_team_user").on(table.teamId, table.userId),
  ],
);

export const teamWorkspaces = pgTable(
  "team_workspaces",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    teamId: varchar("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sharedAt: timestamp("shared_at").defaultNow(),
  },
  (table) => [
    index("IDX_team_workspaces_team_id").on(table.teamId),
    index("IDX_team_workspaces_workspace_id").on(table.workspaceId),
    uniqueIndex("UQ_team_workspaces_team_ws").on(
      table.teamId,
      table.workspaceId,
    ),
  ],
);

export const CURSOR_COLORS = [
  "#FF6600",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#84CC16",
  "#06B6D4",
] as const;

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  inviteCode: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  joinedAt: true,
});

export const insertTeamWorkspaceSchema = createInsertSchema(
  teamWorkspaces,
).omit({ id: true, sharedAt: true });

export const joinTeamSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required").max(8),
});

export const TEAM_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamWorkspace = typeof teamWorkspaces.$inferSelect;
export type InsertTeamWorkspace = z.infer<typeof insertTeamWorkspaceSchema>;
