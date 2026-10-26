import {
  pgTable,
  text,
  timestamp,
  integer,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const teams = pgTable(
  "teams",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 64 }).notNull(),
    inviteCode: varchar("invite_code", { length: 8 }).unique().notNull(),
    ownerId: varchar("owner_id").notNull(), // plain col: users live in auth_db
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
    userId: varchar("user_id").notNull(), // plain col: cross-db integrity is app-side
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
    workspaceId: varchar("workspace_id", { length: 128 }).notNull(), // plain col
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

export {
  CURSOR_COLORS,
  TEAM_ROLES,
  insertTeamSchema,
  insertTeamMemberSchema,
  insertTeamWorkspaceSchema,
  joinTeamSchema,
  updateMemberRoleSchema,
} from "@shared/schema/team-contract";
export type {
  TeamRole,
  InsertTeam,
  InsertTeamMember,
  InsertTeamWorkspace,
} from "@shared/schema/team-contract";

export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamWorkspace = typeof teamWorkspaces.$inferSelect;

// Read-through ownership mirror (populated via the workspace service's
// lookup endpoint). THROWAWAY with the collaborators revamp.
export const workspaceOwners = pgTable("workspace_owners", {
  workspaceId: varchar("workspace_id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  title: text("title").notNull().default(""),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export type WorkspaceOwner = typeof workspaceOwners.$inferSelect;
