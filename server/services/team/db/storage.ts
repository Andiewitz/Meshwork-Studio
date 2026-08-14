import { db } from "./connection";
import {
  teams,
  teamMembers,
  teamWorkspaces,
  CURSOR_COLORS,
  type Team,
  type TeamMember,
  type TeamWorkspace,
  type TeamRole,
} from "./schema";
import { workspaces, type Workspace } from "@services/workspace/db/schema";
import { users } from "@services/auth/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { DrizzleTx } from "@server/lib/events";
import crypto from "crypto";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `MX-${code}`;
}

async function pickCursorColor(teamId: string): Promise<string> {
  const existing = await db
    .select({ color: teamMembers.color })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));

  const usedColors = new Set(existing.map((m) => m.color));

  for (const color of CURSOR_COLORS) {
    if (!usedColors.has(color)) return color;
  }
  return CURSOR_COLORS[existing.length % CURSOR_COLORS.length];
}

export interface ITeamStorage {
  createTeam(name: string, ownerId: string): Promise<Team>;
  getTeamsByUser(userId: string): Promise<(Team & { memberCount: number })[]>;
  getTeam(teamId: string): Promise<Team | undefined>;
  getTeamMembers(teamId: string): Promise<
    (TeamMember & {
      email: string;
      firstName: string | null;
      profileImageUrl: string | null;
    })[]
  >;
  joinTeam(
    inviteCode: string,
    userId: string,
  ): Promise<{ team: Team; member: TeamMember }>;
  leaveTeam(teamId: string, userId: string): Promise<void>;
  deleteTeam(teamId: string): Promise<void>;
  regenerateInviteCode(teamId: string): Promise<Team>;
  shareWorkspace(teamId: string, workspaceId: number): Promise<TeamWorkspace>;
  unshareWorkspace(teamId: string, workspaceId: number): Promise<void>;
  getTeamWorkspaces(teamId: string): Promise<Workspace[]>;
  isTeamMember(teamId: string, userId: string): Promise<boolean>;
  isTeamOwner(teamId: string, userId: string): Promise<boolean>;
  getTeamsForWorkspace(workspaceId: number): Promise<Team[]>;
  updateMemberRole(
    teamId: string,
    targetUserId: string,
    newRole: TeamRole,
  ): Promise<TeamMember>;
  getMemberRole(teamId: string, userId: string): Promise<TeamRole | null>;
  getWorkspaceRole(
    workspaceId: number,
    userId: string,
  ): Promise<TeamRole | "workspace-owner" | null>;
  canAccessWorkspace(userId: string, workspaceId: number): Promise<boolean>;
  deleteAllUserData(userId: string, tx?: DrizzleTx): Promise<void>;
}

export class TeamDatabaseStorage implements ITeamStorage {
  async createTeam(name: string, ownerId: string): Promise<Team> {
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db
        .select()
        .from(teams)
        .where(eq(teams.inviteCode, inviteCode));
      if (existing.length === 0) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    const [team] = await db
      .insert(teams)
      .values({ name, ownerId, inviteCode })
      .returning();

    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: ownerId,
      role: "owner",
      color: CURSOR_COLORS[0],
    });

    return team;
  }

  async getTeamsByUser(
    userId: string,
  ): Promise<(Team & { memberCount: number })[]> {
    return await db
      .select({
        id: teams.id,
        name: teams.name,
        ownerId: teams.ownerId,
        inviteCode: teams.inviteCode,
        createdAt: teams.createdAt,
        memberCount: sql<number>`cast(count(${teamMembers.id}) as integer)`,
      })
      .from(teams)
      .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .where(
        inArray(
          teams.id,
          db
            .select({ teamId: teamMembers.teamId })
            .from(teamMembers)
            .where(eq(teamMembers.userId, userId)),
        ),
      )
      .groupBy(teams.id);
  }

  async getTeam(teamId: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    return team;
  }

  async getTeamMembers(teamId: string) {
    const members = await db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        role: teamMembers.role,
        color: teamMembers.color,
        joinedAt: teamMembers.joinedAt,
        email: users.email,
        firstName: users.firstName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    return members;
  }

  async joinTeam(
    inviteCode: string,
    userId: string,
  ): Promise<{ team: Team; member: TeamMember }> {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.inviteCode, inviteCode));
    if (!team) throw new Error("Invalid invite code");

    const [existing] = await db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)),
      );
    if (existing) throw new Error("Already a member of this team");

    const color = await pickCursorColor(team.id);

    const [member] = await db
      .insert(teamMembers)
      .values({ teamId: team.id, userId, role: "viewer", color })
      .returning();

    return { team, member };
  }

  async leaveTeam(teamId: string, userId: string): Promise<void> {
    await db
      .delete(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      );
  }

  async deleteTeam(teamId: string): Promise<void> {
    await db.delete(teams).where(eq(teams.id, teamId));
  }

  async regenerateInviteCode(teamId: string): Promise<Team> {
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db
        .select()
        .from(teams)
        .where(eq(teams.inviteCode, inviteCode));
      if (existing.length === 0) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    const [team] = await db
      .update(teams)
      .set({ inviteCode })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async shareWorkspace(
    teamId: string,
    workspaceId: number,
  ): Promise<TeamWorkspace> {
    const [existing] = await db
      .select()
      .from(teamWorkspaces)
      .where(
        and(
          eq(teamWorkspaces.teamId, teamId),
          eq(teamWorkspaces.workspaceId, workspaceId),
        ),
      );
    if (existing) return existing;

    const [tw] = await db
      .insert(teamWorkspaces)
      .values({ teamId, workspaceId })
      .returning();
    return tw;
  }

  async unshareWorkspace(teamId: string, workspaceId: number): Promise<void> {
    await db
      .delete(teamWorkspaces)
      .where(
        and(
          eq(teamWorkspaces.teamId, teamId),
          eq(teamWorkspaces.workspaceId, workspaceId),
        ),
      );
  }

  async getTeamWorkspaces(teamId: string): Promise<Workspace[]> {
    const shared = await db
      .select({ workspaceId: teamWorkspaces.workspaceId })
      .from(teamWorkspaces)
      .where(eq(teamWorkspaces.teamId, teamId));

    if (shared.length === 0) return [];

    return await db
      .select()
      .from(workspaces)
      .where(
        inArray(
          workspaces.id,
          shared.map((s) => s.workspaceId),
        ),
      );
  }

  async isTeamMember(teamId: string, userId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      );
    return !!member;
  }

  async isTeamOwner(teamId: string, userId: string): Promise<boolean> {
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    return team?.ownerId === userId;
  }

  async getTeamsForWorkspace(workspaceId: number): Promise<Team[]> {
    const shared = await db
      .select({ teamId: teamWorkspaces.teamId })
      .from(teamWorkspaces)
      .where(eq(teamWorkspaces.workspaceId, workspaceId));

    if (shared.length === 0) return [];

    return await db
      .select()
      .from(teams)
      .where(
        inArray(
          teams.id,
          shared.map((s) => s.teamId),
        ),
      );
  }

  async canAccessWorkspace(
    userId: string,
    workspaceId: number,
  ): Promise<boolean> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (workspace?.userId === userId) return true;

    const teamsWithAccess = await db
      .select({ teamId: teamWorkspaces.teamId })
      .from(teamWorkspaces)
      .where(eq(teamWorkspaces.workspaceId, workspaceId));

    if (teamsWithAccess.length === 0) return false;

    const teamIds = teamsWithAccess.map((t) => t.teamId);
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId),
          inArray(teamMembers.teamId, teamIds),
        ),
      );

    return !!membership;
  }

  async updateMemberRole(
    teamId: string,
    targetUserId: string,
    newRole: TeamRole,
  ): Promise<TeamMember> {
    const [updated] = await db
      .update(teamMembers)
      .set({ role: newRole })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, targetUserId),
        ),
      )
      .returning();
    return updated;
  }

  async getMemberRole(
    teamId: string,
    userId: string,
  ): Promise<TeamRole | null> {
    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      );
    return (member?.role as TeamRole) || null;
  }

  async getWorkspaceRole(
    workspaceId: number,
    userId: string,
  ): Promise<TeamRole | "workspace-owner" | null> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (workspace?.userId === userId) return "workspace-owner";

    const shared = await db
      .select({ teamId: teamWorkspaces.teamId })
      .from(teamWorkspaces)
      .where(eq(teamWorkspaces.workspaceId, workspaceId));

    if (shared.length === 0) return null;

    const teamIds = shared.map((s) => s.teamId);
    const memberships = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId),
          inArray(teamMembers.teamId, teamIds),
        ),
      );

    if (memberships.length === 0) return null;

    const roleWeights: Record<string, number> = {
      owner: 4,
      admin: 3,
      editor: 2,
      viewer: 1,
    };

    let highestRole: TeamRole = "viewer";
    let highestWeight = 0;

    for (const m of memberships) {
      const role = m.role as TeamRole;
      const weight = roleWeights[role] || 0;
      if (weight > highestWeight) {
        highestWeight = weight;
        highestRole = role;
      }
    }

    return highestRole;
  }

  async deleteAllUserData(
    userId: string,
    providedTx?: DrizzleTx,
  ): Promise<void> {
    const execute = async (tx: DrizzleTx) => {
      await tx.delete(teams).where(eq(teams.ownerId, userId));
    };

    if (providedTx) {
      await execute(providedTx);
    } else {
      await db.transaction(execute);
    }
  }
}

export const teamStorage: ITeamStorage = new TeamDatabaseStorage();
