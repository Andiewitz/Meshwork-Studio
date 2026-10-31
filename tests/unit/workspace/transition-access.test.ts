import { describe, expect, it, vi } from "vitest";
import { workspaceAccess } from "@server/lib/workspace-access";

describe("Workspace-owned access", () => {
  it.each([
    ["owner", "workspace-owner"],
    ["edit", "editor"],
    ["view", "viewer"],
    ["none", null],
  ] as const)("maps %s to %s", async (value, role) => {
    const getAccess = vi.fn().mockResolvedValue({ status: "available", value });
    const access = workspaceAccess({ getAccess });
    await expect(access.getWorkspaceRole("w", "u")).resolves.toBe(role);
    await expect(access.canAccessWorkspace("u", "w")).resolves.toBe(
      role !== null,
    );
    expect(getAccess).toHaveBeenCalledWith("w", "u");
  });
  it("preserves an outage as an error", async () => {
    const cause = new Error("offline");
    const access = workspaceAccess({
      getAccess: async () => ({ status: "unavailable", cause }),
    });
    await expect(access.canAccessWorkspace("u", "w")).rejects.toBe(cause);
  });
});
