// Browser-safe contracts. Deliberately independent of Drizzle table schemas.
import { z } from "zod";

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
export const TEAM_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

// Match the existing generated validators, including defaults/optional fields.
// In particular, insert role is a varchar, not the role-change enum.
export const insertTeamSchema = z.object({
  name: z.string().max(64),
  ownerId: z.string(),
});
export const insertTeamMemberSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
  role: z.string().max(16).optional(),
  color: z.string().max(7),
});
export const insertTeamWorkspaceSchema = z.object({
  teamId: z.string(),
  workspaceId: z.string().max(128),
});
export const joinTeamSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required").max(8),
});
export const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type InsertTeamWorkspace = z.infer<typeof insertTeamWorkspaceSchema>;
