import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({
  readCachedWorkspaceRole: vi.fn(),
  cacheWorkspaceRole: vi.fn(),
  invalidateWorkspaceAccess: vi.fn(),
}));

const db = vi.hoisted(() => ({
  select: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@services/team/db/access-cache", () => ({
  readCachedWorkspaceRole: cache.readCachedWorkspaceRole,
  cacheWorkspaceRole: cache.cacheWorkspaceRole,
  invalidateWorkspaceAccess: cache.invalidateWorkspaceAccess,
}));

vi.mock("@services/team/db/connection", () => ({ db }));

vi.mock("@services/team/db/ownership-client", () => ({
  fetchWorkspaceOwners: vi.fn(),
}));

import { TeamDatabaseStorage } from "@services/team/db/storage";

describe("TeamDatabaseStorage access cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a cached role without touching the database", async () => {
    cache.readCachedWorkspaceRole.mockResolvedValueOnce({
      hit: true,
      value: "editor",
    });
    const storage = new TeamDatabaseStorage();

    await expect(storage.getWorkspaceRole("ws1", "u1")).resolves.toBe("editor");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("answers access checks from a cached role", async () => {
    const storage = new TeamDatabaseStorage();

    cache.readCachedWorkspaceRole.mockResolvedValueOnce({
      hit: true,
      value: "viewer",
    });
    await expect(storage.canAccessWorkspace("u1", "ws1")).resolves.toBe(true);

    cache.readCachedWorkspaceRole.mockResolvedValueOnce({
      hit: true,
      value: null,
    });
    await expect(storage.canAccessWorkspace("u2", "ws1")).resolves.toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("invalidates affected members and workspaces when a team is deleted", async () => {
    const storage = new TeamDatabaseStorage();
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ workspaceId: "ws1" }])
      .mockResolvedValueOnce([{ userId: "u1" }, { userId: "u2" }]);
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    });
    db.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    await storage.deleteTeam("team1");

    expect(cache.invalidateWorkspaceAccess).toHaveBeenCalledWith(
      ["ws1"],
      ["u1", "u2"],
    );
  });
  it("removes memberships in other teams and invalidates affected access", async () => {
    const storage = new TeamDatabaseStorage();
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ id: "owned" }])
      .mockResolvedValueOnce([{ teamId: "other" }, { teamId: "owned" }])
      .mockResolvedValueOnce([
        { workspaceId: "ws-owned" },
        { workspaceId: "ws-other" },
      ])
      .mockResolvedValueOnce([{ userId: "member" }, { userId: "user" }]);
    const remove = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const tx = {
      select: vi
        .fn()
        .mockReturnValue({ from: vi.fn().mockReturnValue({ where }) }),
      delete: remove,
    };
    db.transaction.mockImplementation(async (fn) => fn(tx));
    await storage.deleteAllUserData("user");
    const { teamMembers, teams } = await import("@services/team/db/schema");
    expect(remove).toHaveBeenNthCalledWith(1, teamMembers);
    expect(remove).toHaveBeenNthCalledWith(2, teams);
    expect(cache.invalidateWorkspaceAccess).toHaveBeenCalledWith(
      ["ws-owned", "ws-other"],
      ["user", "member"],
    );
  });

  it("propagates cleanup failure without claiming cache invalidation", async () => {
    const storage = new TeamDatabaseStorage();
    db.transaction.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(storage.deleteAllUserData("user")).rejects.toThrow(
      "database unavailable",
    );
    expect(cache.invalidateWorkspaceAccess).not.toHaveBeenCalled();
  });
});
