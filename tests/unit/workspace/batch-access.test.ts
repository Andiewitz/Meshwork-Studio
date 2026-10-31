import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), where: vi.fn() }));
vi.mock("@services/workspace/db/connection", () => ({
  db: { select: mocks.select },
  pool: {},
}));
import { WorkspaceDatabaseStorage } from "@services/workspace/db/storage";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({
    from: () => ({ leftJoin: () => ({ where: mocks.where }) }),
  });
});
describe("batched Workspace access", () => {
  it("uses one query for owner, collaborators, strangers and duplicates", async () => {
    mocks.where.mockResolvedValueOnce([
      { ownerId: "owner", collaboratorId: "viewer", permission: "view" },
      { ownerId: "owner", collaboratorId: "editor", permission: "edit" },
    ]);
    const storage = new WorkspaceDatabaseStorage();
    await expect(
      storage.getWorkspaceAccessBatch("ws", [
        "owner",
        "viewer",
        "editor",
        "stranger",
        "viewer",
      ]),
    ).resolves.toEqual([
      { userId: "owner", access: "owner" },
      { userId: "viewer", access: "view" },
      { userId: "editor", access: "edit" },
      { userId: "stranger", access: "none" },
    ]);
    expect(mocks.select).toHaveBeenCalledOnce();
  });
  it("denies all if workspace is missing and avoids a query for empty input", async () => {
    const storage = new WorkspaceDatabaseStorage();
    mocks.where.mockResolvedValueOnce([]);
    await expect(
      storage.getWorkspaceAccessBatch("missing", ["owner"]),
    ).resolves.toEqual([{ userId: "owner", access: "none" }]);
    await expect(
      storage.getWorkspaceAccessBatch("missing", []),
    ).resolves.toEqual([]);
    expect(mocks.select).toHaveBeenCalledOnce();
  });
  it("limits each query to 500 users", async () => {
    mocks.where.mockResolvedValue([]);
    const users = Array.from({ length: 501 }, (_, i) => `user-${i}`);
    const result = await new WorkspaceDatabaseStorage().getWorkspaceAccessBatch(
      "ws",
      users,
    );
    expect(result).toHaveLength(501);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(result.every((v) => v.access === "none")).toBe(true);
  });
});
