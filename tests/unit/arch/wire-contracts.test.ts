import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { createInsertSchema } from "drizzle-zod";
import { teams, teamMembers, teamWorkspaces } from "@services/team/db/schema";
import {
  insertTeamSchema,
  insertTeamMemberSchema,
  insertTeamWorkspaceSchema,
} from "@shared/schema/team-contract";
import { workspaceDtoSchema, teamDtoSchema } from "@shared/contracts/dtos";

describe("public contracts preserve existing JSON", () => {
  it("bundles the shared hub and public entries for a browser without database/runtime dependencies", async () => {
    const result = await build({
      entryPoints: [
        "server/shared/schema.ts",
        "server/services/workspace/public.ts",
        "server/services/team/public.ts",
      ],
      outdir: "unused-contract-build",
      bundle: true,
      write: false,
      metafile: true,
      platform: "browser",
      format: "esm",
      logLevel: "silent",
    });
    expect(
      Object.keys(result.metafile.inputs).filter((file) =>
        /(?:drizzle|\/pg\/|services\/.+\/db\/|@aws-sdk|openai|express)/.test(
          file.replaceAll("\\", "/"),
        ),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "team",
      insertTeamSchema,
      createInsertSchema(teams).omit({
        id: true,
        createdAt: true,
        inviteCode: true,
      }),
      [
        {},
        { name: "Team", ownerId: "u" },
        { name: "", ownerId: "" },
        { name: "a".repeat(65), ownerId: "u" },
        { name: null, ownerId: "u" },
        { name: "Team", ownerId: "u", inviteCode: "ignored" },
      ],
    ],
    [
      "member",
      insertTeamMemberSchema,
      createInsertSchema(teamMembers).omit({ id: true, joinedAt: true }),
      [
        {},
        { teamId: "t", userId: "u", color: "#ff6600" },
        { teamId: "t", userId: "u", color: "#ff6600", role: "member" },
        { teamId: "t", userId: "u", color: "#ff6600", role: null },
        { teamId: "t", userId: "u", color: "#ff6600", role: "a".repeat(17) },
        { teamId: "t", userId: "u", color: "too-long", role: "viewer" },
      ],
    ],
    [
      "share",
      insertTeamWorkspaceSchema,
      createInsertSchema(teamWorkspaces).omit({ id: true, sharedAt: true }),
      [
        {},
        { teamId: "t", workspaceId: "w" },
        { teamId: "t", workspaceId: "w".repeat(129) },
        { teamId: "t", workspaceId: null },
      ],
    ],
  ] as const)(
    "matches the previous generated %s request validation",
    (_name, current, previous, samples) => {
      for (const input of samples) {
        const before = previous.safeParse(input);
        const after = current.safeParse(input);
        expect(after.success, JSON.stringify(input)).toBe(before.success);
        if (before.success && after.success)
          expect(after.data).toEqual(before.data);
        if (!before.success && !after.success)
          expect(after.error.issues).toEqual(before.error.issues);
      }
    },
  );

  it("describes the existing Date-to-ISO JSON serialization without changing fields", () => {
    const row = {
      id: "ws",
      title: "Project",
      type: "system",
      icon: null,
      isFavorite: false,
      userId: "owner",
      collectionId: null,
      createdAt: new Date("2026-10-26T08:00:00Z"),
      updatedAt: null,
      description: null,
      author: null,
      aiContext: null,
      groups: [],
      tags: [],
      canvasCopyStatus: "ready",
      canvasCopySourceId: null,
    };
    expect(workspaceDtoSchema.safeParse(row).success).toBe(false);
    const wire = JSON.parse(JSON.stringify(row));
    expect(workspaceDtoSchema.parse(wire)).toEqual(wire);
    expect(wire.createdAt).toBe("2026-10-26T08:00:00.000Z");
    expect(
      workspaceDtoSchema.safeParse({ ...wire, createdAt: "yesterday" }).success,
    ).toBe(false);
    const teamRow = {
      id: "team",
      name: "Team",
      inviteCode: "MX-12345",
      ownerId: "owner",
      createdAt: row.createdAt,
    };
    expect(teamDtoSchema.parse(JSON.parse(JSON.stringify(teamRow)))).toEqual({
      ...teamRow,
      createdAt: row.createdAt.toISOString(),
    });
  });
});
