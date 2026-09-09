import { describe, it, expect } from "vitest";
import {
  insertTeamSchema,
  insertTeamMemberSchema,
  joinTeamSchema,
  updateMemberRoleSchema,
  TEAM_ROLES,
} from "@services/team/db/schema";

describe("Team Schema (Unit)", () => {
  // ─── insertTeamSchema ──────────────────────────────────────────────

  describe("insertTeamSchema", () => {
    it("accepts valid team data", () => {
      const result = insertTeamSchema.safeParse({
        name: "Design Team Alpha",
        ownerId: "user-123",
        inviteCode: "MX-ABCDEF",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing name", () => {
      const result = insertTeamSchema.safeParse({
        ownerId: "user-123",
        inviteCode: "MX-ABCDEF",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing ownerId", () => {
      const result = insertTeamSchema.safeParse({
        name: "Team Alpha",
        inviteCode: "MX-ABCDEF",
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── insertTeamMemberSchema ────────────────────────────────────────

  describe("insertTeamMemberSchema", () => {
    it("accepts valid member data", () => {
      const result = insertTeamMemberSchema.safeParse({
        teamId: "team-123",
        userId: "user-456",
        role: "member",
        color: "#FF6600",
      });
      expect(result.success).toBe(true);
    });

    it("accepts member without optional role", () => {
      const result = insertTeamMemberSchema.safeParse({
        teamId: "team-123",
        userId: "user-456",
        color: "#FF6600",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing teamId", () => {
      const result = insertTeamMemberSchema.safeParse({
        userId: "user-456",
        color: "#FF6600",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing userId", () => {
      const result = insertTeamMemberSchema.safeParse({
        teamId: "team-123",
        color: "#FF6600",
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── joinTeamSchema ────────────────────────────────────────────────

  describe("joinTeamSchema", () => {
    it("accepts valid invite code (4 chars)", () => {
      expect(joinTeamSchema.safeParse({ inviteCode: "ABCD" }).success).toBe(
        true,
      );
    });

    it("accepts valid invite code (8 chars)", () => {
      expect(joinTeamSchema.safeParse({ inviteCode: "MX-12345" }).success).toBe(
        true,
      );
    });

    it("rejects empty invite code", () => {
      expect(joinTeamSchema.safeParse({ inviteCode: "" }).success).toBe(false);
    });

    it("rejects invite code over 10 chars", () => {
      expect(
        joinTeamSchema.safeParse({ inviteCode: "MX-1234567890" }).success,
      ).toBe(false);
    });

    it("rejects missing inviteCode field", () => {
      expect(joinTeamSchema.safeParse({}).success).toBe(false);
    });
  });

  // ─── updateMemberRoleSchema ─────────────────────────────────────────

  describe("updateMemberRoleSchema", () => {
    it("accepts valid role: admin", () => {
      expect(updateMemberRoleSchema.safeParse({ role: "admin" }).success).toBe(
        true,
      );
    });

    it("accepts valid role: editor", () => {
      expect(updateMemberRoleSchema.safeParse({ role: "editor" }).success).toBe(
        true,
      );
    });

    it("accepts valid role: viewer", () => {
      expect(updateMemberRoleSchema.safeParse({ role: "viewer" }).success).toBe(
        true,
      );
    });

    it("rejects owner role (cannot set via API)", () => {
      expect(updateMemberRoleSchema.safeParse({ role: "owner" }).success).toBe(
        false,
      );
    });

    it("rejects arbitrary role strings", () => {
      expect(
        updateMemberRoleSchema.safeParse({ role: "superadmin" }).success,
      ).toBe(false);
      expect(updateMemberRoleSchema.safeParse({ role: "member" }).success).toBe(
        false,
      );
      expect(updateMemberRoleSchema.safeParse({ role: "" }).success).toBe(
        false,
      );
    });

    it("rejects missing role", () => {
      expect(updateMemberRoleSchema.safeParse({}).success).toBe(false);
    });
  });

  // ─── TEAM_ROLES constant ──────────────────────────────────────────

  describe("TEAM_ROLES", () => {
    it("contains exactly 4 roles in correct order", () => {
      expect(TEAM_ROLES).toEqual(["owner", "admin", "editor", "viewer"]);
    });
  });
});
