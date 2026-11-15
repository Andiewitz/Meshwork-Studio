import { describe, expect, it } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import {
  canvasMatchesPreview,
  describeCanvasChanges,
} from "@/features/workspace/agent/tools/canvasChangePreview";

const a: Node = {
  id: "a",
  type: "server",
  position: { x: 0, y: 0 },
  data: { label: "API" },
};
const b: Node = {
  id: "b",
  type: "database",
  position: { x: 200, y: 0 },
  data: { label: "Database" },
};
const edge: Edge = { id: "ab", source: "a", target: "b" };

describe("AI canvas change review", () => {
  it("lists indirect removals and requires review for any deletion", () => {
    const preview = describeCanvasChanges([a, b], [edge], [a], []);
    expect(preview.removedNodes).toEqual([{ id: "b", label: "Database" }]);
    expect(preview.removedEdges).toEqual([
      { id: "ab", label: "API → Database" },
    ]);
    expect(preview.requiresReview).toBe(true);
  });
  it("marks removed nodes that contain a nested canvas", () => {
    const nested = {
      ...a,
      data: { label: "Service", subCanvas: { nodes: [b], edges: [] } },
    };
    const preview = describeCanvasChanges([nested], [], [], []);
    expect(preview.removedNodes[0].label).toContain("contains a nested canvas");
  });
  it("reviews replacements, rearrangements, and batches of five", () => {
    expect(
      describeCanvasChanges([a], [], [a], [], [{ action: "replace_all" }])
        .requiresReview,
    ).toBe(true);
    expect(
      describeCanvasChanges([a], [], [a], [], [{ action: "reorganize" }])
        .requiresReview,
    ).toBe(true);
    const added = Array.from({ length: 5 }, (_, i) => ({
      ...a,
      id: `new-${i}`,
    }));
    expect(describeCanvasChanges([], [], added, []).requiresReview).toBe(true);
    expect(
      describeCanvasChanges([], [], added.slice(0, 4), []).requiresReview,
    ).toBe(false);
  });
  it("lists changed and added objects and refuses a stale base", () => {
    const changed = { ...a, data: { label: "New API" } };
    const preview = describeCanvasChanges([a], [], [changed, b], [edge]);
    expect(preview.changedNodes).toEqual([{ id: "a", label: "New API" }]);
    expect(preview.addedNodes).toEqual([{ id: "b", label: "Database" }]);
    expect(preview.addedEdges).toHaveLength(1);
    const base = JSON.stringify({ nodes: [a], edges: [] });
    expect(canvasMatchesPreview(base, [a], [])).toBe(true);
    expect(canvasMatchesPreview(base, [changed], [])).toBe(false);
  });
});
