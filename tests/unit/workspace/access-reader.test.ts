import { describe, expect, it } from "vitest";
import { createWorkspaceAccessReader } from "@services/workspace/public";

describe("Workspace access capability", () => {
  it.each(["owner", "edit", "view", "none"] as const)(
    "returns %s as an available decision",
    async (access) => {
      const reader = createWorkspaceAccessReader({
        getWorkspaceAccess: async () => access,
      });
      await expect(reader.getAccess("w", "u")).resolves.toEqual({
        status: "available",
        value: access,
      });
    },
  );
  it("keeps storage failure separate from a denied permission", async () => {
    const failure = new Error("database unavailable");
    const reader = createWorkspaceAccessReader({
      getWorkspaceAccess: async () => {
        throw failure;
      },
    });
    await expect(reader.getAccess("w", "u")).resolves.toEqual({
      status: "unavailable",
      cause: failure,
    });
  });
});
