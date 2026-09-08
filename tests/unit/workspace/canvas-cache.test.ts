import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveCanvasToLocalCache,
  getCanvasFromLocalCache,
  clearCanvasLocalCache,
  CANVAS_CACHE_PREFIX,
} from "@/lib/canvas-cache";
// type imports removed to circumvent test runner plugin crash

describe("Canvas Caching Utilities (Unit)", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    });
    vi.clearAllMocks();
  });

  it("should save canvas data to local storage with a timestamp", () => {
    const workspaceId = 1;
    const nodes: any[] = [
      { id: "test-node", position: { x: 0, y: 0 }, data: { label: "Test" } },
    ];
    const edges: any[] = [{ id: "test-edge", source: "a", target: "b" }];

    saveCanvasToLocalCache(workspaceId, nodes, edges);

    const savedData = localStorage.getItem(
      `${CANVAS_CACHE_PREFIX}${workspaceId}`,
    );
    expect(savedData).not.toBeNull();

    const parsed = JSON.parse(savedData!);
    expect(parsed.nodes).toEqual(nodes);
    expect(parsed.edges).toEqual(edges);
    expect(parsed.timestamp).toBeTypeOf("number");
  });

  it("should retrieve correctly parsed canvas data from local storage", () => {
    const workspaceId = 2;
    const mockData = {
      nodes: [{ id: "test", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      timestamp: Date.now(),
    };

    localStorage.setItem(
      `${CANVAS_CACHE_PREFIX}${workspaceId}`,
      JSON.stringify(mockData),
    );

    const retrieved = getCanvasFromLocalCache(workspaceId);
    expect(retrieved).toEqual(mockData);
  });

  it("should return null if there is no cache for the workspace ID", () => {
    const retrieved = getCanvasFromLocalCache(999);
    expect(retrieved).toBeNull();
  });

  it("should clear only the specific workspace cache from localStorage", () => {
    const workspaceId = 3;
    const mockData = { nodes: [], edges: [], timestamp: 123 };

    localStorage.setItem(
      `${CANVAS_CACHE_PREFIX}${workspaceId}`,
      JSON.stringify(mockData),
    );
    localStorage.setItem(`${CANVAS_CACHE_PREFIX}999`, JSON.stringify(mockData)); // Another workspace cache

    clearCanvasLocalCache(workspaceId);

    // Workspace 3 should map to null
    expect(
      localStorage.getItem(`${CANVAS_CACHE_PREFIX}${workspaceId}`),
    ).toBeNull();
    // Workspace 999 should remain untouched
    expect(localStorage.getItem(`${CANVAS_CACHE_PREFIX}999`)).not.toBeNull();
  });

  it("does not clear a newer local generation when an older save is acknowledged", () => {
    const workspaceId = 3;
    saveCanvasToLocalCache(workspaceId, [], [], 2);

    expect(clearCanvasLocalCache(workspaceId, 1)).toBe(false);
    expect(getCanvasFromLocalCache(workspaceId)?.generation).toBe(2);

    expect(clearCanvasLocalCache(workspaceId, 2)).toBe(true);
    expect(getCanvasFromLocalCache(workspaceId)).toBeNull();
  });

  it("should handle corrupt JSON gracefully by returning null", () => {
    const workspaceId = 4;
    // Seed corrupt JSON
    localStorage.setItem(
      `${CANVAS_CACHE_PREFIX}${workspaceId}`,
      "i-am-not-valid-json",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const retrieved = getCanvasFromLocalCache(workspaceId);

    // Assert it returns null and triggers console.warn instead of crashing the app
    expect(retrieved).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to read canvas from local cache",
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
