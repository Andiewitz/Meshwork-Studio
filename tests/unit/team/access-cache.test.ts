import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  enabled: true,
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@server/lib/redis", () => ({
  getRedis: () =>
    redis.enabled
      ? { status: "ready", get: redis.get, set: redis.set, del: redis.del }
      : null,
}));

import {
  cacheSharedWorkspaceIds,
  cacheWorkspaceRole,
  invalidateWorkspaceAccess,
  readCachedSharedWorkspaceIds,
  readCachedWorkspaceRole,
} from "@services/team/db/access-cache";

describe("team access cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.enabled = true;
  });

  it("reads a cached role, including cached non-membership", async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ role: "editor" }));
    await expect(readCachedWorkspaceRole("ws1", "u1")).resolves.toEqual({
      hit: true,
      value: "editor",
    });
    expect(redis.get).toHaveBeenCalledWith("access:role:ws1:u1");

    redis.get.mockResolvedValueOnce(JSON.stringify({ role: null }));
    await expect(readCachedWorkspaceRole("ws1", "u2")).resolves.toEqual({
      hit: true,
      value: null,
    });
  });

  it("treats missing, malformed, and unavailable Redis as a miss", async () => {
    redis.get.mockResolvedValueOnce(null);
    await expect(readCachedWorkspaceRole("ws1", "u1")).resolves.toEqual({
      hit: false,
      value: null,
    });

    redis.get.mockResolvedValueOnce("not-json");
    await expect(readCachedWorkspaceRole("ws1", "u1")).resolves.toEqual({
      hit: false,
      value: null,
    });

    redis.get.mockRejectedValueOnce(new Error("redis down"));
    await expect(readCachedWorkspaceRole("ws1", "u1")).resolves.toEqual({
      hit: false,
      value: null,
    });

    redis.enabled = false;
    await expect(readCachedWorkspaceRole("ws1", "u1")).resolves.toEqual({
      hit: false,
      value: null,
    });
  });

  it("writes roles with a 60s TTL, including null roles", async () => {
    await cacheWorkspaceRole("ws1", "u1", "workspace-owner");
    expect(redis.set).toHaveBeenCalledWith(
      "access:role:ws1:u1",
      JSON.stringify({ role: "workspace-owner" }),
      "EX",
      60,
    );

    await cacheWorkspaceRole("ws1", "u2", null);
    expect(redis.set).toHaveBeenLastCalledWith(
      "access:role:ws1:u2",
      JSON.stringify({ role: null }),
      "EX",
      60,
    );
  });

  it("caches empty shared-workspace lists and reads them back", async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify([]));
    await expect(readCachedSharedWorkspaceIds("u1")).resolves.toEqual([]);

    await cacheSharedWorkspaceIds("u1", []);
    expect(redis.set).toHaveBeenCalledWith(
      "access:sharedws:u1",
      "[]",
      "EX",
      60,
    );
  });

  it("rejects malformed shared-workspace entries", async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify(["ws1", 2]));
    await expect(readCachedSharedWorkspaceIds("u1")).resolves.toBeNull();
  });

  it("invalidates the workspace/user cross-product and shared lists", async () => {
    await invalidateWorkspaceAccess(["ws1", "ws2"], ["u1", "u2"]);

    expect(redis.del).toHaveBeenCalledWith(
      "access:role:ws1:u1",
      "access:role:ws1:u2",
      "access:role:ws2:u1",
      "access:role:ws2:u2",
      "access:sharedws:u1",
      "access:sharedws:u2",
    );
  });

  it("batches large invalidations", async () => {
    const workspaceIds = Array.from(
      { length: 600 },
      (_, index) => `ws${index}`,
    );
    await invalidateWorkspaceAccess(workspaceIds, ["u1"]);

    expect(redis.del).toHaveBeenCalledTimes(2);
    expect(redis.del.mock.calls[0]).toHaveLength(500);
    expect(redis.del.mock.calls[1]).toHaveLength(101);
  });

  it("does nothing when Redis is disabled", async () => {
    redis.enabled = false;
    await cacheWorkspaceRole("ws1", "u1", "viewer");
    await invalidateWorkspaceAccess(["ws1"], ["u1"]);
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });
});
