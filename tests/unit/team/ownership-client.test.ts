import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCachedSharedWorkspaceIds: vi.fn(),
  cacheSharedWorkspaceIds: vi.fn(),
  internalGet: vi.fn(),
}));

vi.mock("@services/team/db/access-cache", () => ({
  readCachedSharedWorkspaceIds: mocks.readCachedSharedWorkspaceIds,
  cacheSharedWorkspaceIds: mocks.cacheSharedWorkspaceIds,
}));

vi.mock("@server/lib/internal", () => ({
  internalGet: mocks.internalGet,
}));

import { fetchSharedWorkspaceIds } from "@services/team/db/ownership-client";

describe("fetchSharedWorkspaceIds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a cache hit without making an internal HTTP call", async () => {
    mocks.readCachedSharedWorkspaceIds.mockResolvedValueOnce(["ws1"]);
    await expect(fetchSharedWorkspaceIds("u1")).resolves.toEqual(["ws1"]);
    expect(mocks.internalGet).not.toHaveBeenCalled();
  });

  it("treats a cached empty list as a hit", async () => {
    mocks.readCachedSharedWorkspaceIds.mockResolvedValueOnce([]);
    await expect(fetchSharedWorkspaceIds("u1")).resolves.toEqual([]);
    expect(mocks.internalGet).not.toHaveBeenCalled();
  });

  it("fetches and caches a miss", async () => {
    mocks.readCachedSharedWorkspaceIds.mockResolvedValueOnce(null);
    mocks.internalGet.mockResolvedValueOnce({ workspaceIds: ["ws1", "ws2"] });
    await expect(fetchSharedWorkspaceIds("u1")).resolves.toEqual([
      "ws1",
      "ws2",
    ]);
    expect(mocks.internalGet).toHaveBeenCalledWith(
      "team",
      "/internal/users/u1/shared-workspace-ids",
    );
    expect(mocks.cacheSharedWorkspaceIds).toHaveBeenCalledWith("u1", [
      "ws1",
      "ws2",
    ]);
  });

  it("does not cache an internal call failure", async () => {
    mocks.readCachedSharedWorkspaceIds.mockResolvedValueOnce(null);
    mocks.internalGet.mockResolvedValueOnce(null);
    await expect(fetchSharedWorkspaceIds("u1")).resolves.toEqual([]);
    expect(mocks.cacheSharedWorkspaceIds).not.toHaveBeenCalled();
  });

  it("caches a successful empty response", async () => {
    mocks.readCachedSharedWorkspaceIds.mockResolvedValueOnce(null);
    mocks.internalGet.mockResolvedValueOnce({ workspaceIds: [] });
    await expect(fetchSharedWorkspaceIds("u1")).resolves.toEqual([]);
    expect(mocks.cacheSharedWorkspaceIds).toHaveBeenCalledWith("u1", []);
  });
});
