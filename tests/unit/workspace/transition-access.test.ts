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
  it("passes access versions through and preserves lookup failures", async () => {
    const cause = new Error("offline");
    const getAccessVersion = vi
      .fn()
      .mockResolvedValueOnce({
        status: "available",
        value: { access: "view", epoch: "42" },
      })
      .mockResolvedValueOnce({ status: "unavailable", cause });
    const access = workspaceAccess({ getAccess: vi.fn(), getAccessVersion });
    await expect(access.getAccessVersion!("w", "u")).resolves.toEqual({
      access: "view",
      epoch: "42",
    });
    await expect(access.getAccessVersion!("w", "u")).rejects.toBe(cause);
  });
});
