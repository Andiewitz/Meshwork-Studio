import { describe, it, expect } from "vitest";
import {
  insertWorkspaceSchema,
  updateWorkspaceCollaboratorPermissionSchema,
  upsertWorkspaceCollaboratorSchema,
  workspaceCollaboratorPermissionSchema,
} from "@shared/schema";

describe("Workspace Schema (Unit)", () => {
  describe("insertWorkspaceSchema", () => {
    it("should accept a valid workspace with all fields", () => {
      const result = insertWorkspaceSchema.safeParse({
        title: "Test Project",
        type: "system",
        icon: "box",
        isFavorite: true,
        userId: "user-123",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Test Project");
        expect(result.data.isFavorite).toBe(true);
      }
    });

    it("should default isFavorite to false when not provided", () => {
      const result = insertWorkspaceSchema.safeParse({
        title: "Test",
        type: "system",
        userId: "user-123",
      });

      expect(result.success).toBe(true);
    });

    it("should accept isFavorite as a boolean", () => {
      const trueResult = insertWorkspaceSchema.safeParse({
        title: "Fav Project",
        type: "system",
        userId: "user-123",
        isFavorite: true,
      });
      expect(trueResult.success).toBe(true);

      const falseResult = insertWorkspaceSchema.safeParse({
        title: "Normal Project",
        type: "system",
        userId: "user-123",
        isFavorite: false,
      });
      expect(falseResult.success).toBe(true);
    });

    it("should reject titles longer than 16 characters", () => {
      const result = insertWorkspaceSchema.safeParse({
        title: "This Title Is Way Too Long For The Limit",
        type: "system",
        userId: "user-123",
      });

      expect(result.success).toBe(false);
    });

    it('should default empty titles to "Untitled"', () => {
      const result = insertWorkspaceSchema.safeParse({
        title: "",
        type: "system",
        userId: "user-123",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Untitled");
      }
    });

    it('should default missing title to "Untitled"', () => {
      const result = insertWorkspaceSchema.safeParse({
        type: "system",
        userId: "user-123",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Untitled");
      }
    });

    it("should reject titles with emojis", () => {
      const result = insertWorkspaceSchema.safeParse({
        title: "Cool 🚀",
        type: "system",
        userId: "user-123",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("workspace collaborator contracts", () => {
    it("accepts only view and edit permissions", () => {
      expect(
        workspaceCollaboratorPermissionSchema.safeParse("view").success,
      ).toBe(true);
      expect(
        workspaceCollaboratorPermissionSchema.safeParse("edit").success,
      ).toBe(true);
      expect(
        workspaceCollaboratorPermissionSchema.safeParse("owner").success,
      ).toBe(false);
      expect(
        workspaceCollaboratorPermissionSchema.safeParse("admin").success,
      ).toBe(false);
    });

    it("validates a complete storage collaborator grant", () => {
      expect(
        upsertWorkspaceCollaboratorSchema.safeParse({
          workspaceId: "workspace-1",
          userId: "user-2",
          permission: "edit",
          addedBy: "owner-1",
        }).success,
      ).toBe(true);
    });

    it("rejects malformed collaborator grants and permission updates", () => {
      expect(
        upsertWorkspaceCollaboratorSchema.safeParse({
          workspaceId: "workspace-1",
          userId: "user-2",
          permission: "owner",
          addedBy: "owner-1",
        }).success,
      ).toBe(false);
      expect(
        updateWorkspaceCollaboratorPermissionSchema.safeParse({
          permission: "admin",
        }).success,
      ).toBe(false);
    });
  });
});
