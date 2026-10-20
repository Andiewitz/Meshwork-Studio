import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasSnapshot } from "@services/canvas/db/model";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  eval: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@server/lib/redis", () => ({
  getRedis: () => ({
    get: mocks.get,
    eval: mocks.eval,
    del: mocks.del,
  }),
}));

import {
  cacheCanvas,
  canvasEtag,
  etagMatches,
  invalidateCanvas,
  readCachedCanvas,
} from "@services/canvas/cache";

const snapshot: CanvasSnapshot = {
  revision: 7,
  nodes: [{ id: "n1", position: { x: 0, y: 0 }, data: { label: "n1" } }],
  edges: [],
};

describe("canvas cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats and matches ETags", () => {
    expect(canvasEtag(42)).toBe('"42"');
    expect(etagMatches(undefined, 42)).toBe(false);
    expect(etagMatches('"42"', 42)).toBe(true);
    expect(etagMatches('W/"42"', 42)).toBe(true);
    expect(etagMatches('"41", "42"', 42)).toBe(true);
    expect(etagMatches("*", 42)).toBe(true);
    expect(etagMatches('"41"', 42)).toBe(false);
  });

  it("reads a revision-keyed snapshot", async () => {
    mocks.get
      .mockResolvedValueOnce("7")
      .mockResolvedValueOnce(JSON.stringify(snapshot));

    await expect(readCachedCanvas("ws")).resolves.toEqual(snapshot);
    expect(mocks.get).toHaveBeenNthCalledWith(1, "canvas:ws:rev");
    expect(mocks.get).toHaveBeenNthCalledWith(2, "canvas:ws:7");
  });

  it("returns null for missing, malformed, or mismatched entries", async () => {
    mocks.get.mockResolvedValueOnce(null);
    await expect(readCachedCanvas("ws")).resolves.toBeNull();

    mocks.get
      .mockResolvedValueOnce("7")
      .mockResolvedValueOnce(JSON.stringify({ ...snapshot, revision: 6 }));
    await expect(readCachedCanvas("ws")).resolves.toBeNull();

    mocks.get.mockRejectedValue(new Error("redis down"));
    await expect(readCachedCanvas("ws")).resolves.toBeNull();
  });

  it("writes the revision pointer and snapshot atomically", async () => {
    await cacheCanvas("ws", snapshot, 6);

    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call"),
      2,
      "canvas:ws:rev",
      "canvas:ws:7",
      "7",
      JSON.stringify(snapshot),
      "600",
      "canvas:ws:6",
    );
  });

  it("does not delete the snapshot when the revision is unchanged", async () => {
    await cacheCanvas("ws", snapshot, 7);
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call"),
      2,
      "canvas:ws:rev",
      "canvas:ws:7",
      "7",
      JSON.stringify(snapshot),
      "600",
      "",
    );
  });

  it("invalidates the revision pointer", async () => {
    await invalidateCanvas("ws");
    expect(mocks.del).toHaveBeenCalledWith("canvas:ws:rev");
  });
});
