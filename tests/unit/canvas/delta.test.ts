import { describe, expect, it } from "vitest";
import {
  applyCanvasChanges,
  canvasSnapshotSyncSchema,
  canvasSyncSchema,
} from "@shared/canvas";

const node = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "service",
  position: { x: 0, y: 0 },
  data: { label: id },
  ...overrides,
});

const edge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
});

describe("canvas delta schema", () => {
  it("accepts a delta without full nodes or edges", () => {
    const result = canvasSyncSchema.safeParse({
      changes: {
        upsertNodes: [node("a")],
        deleteEdgeIds: ["old"],
      },
      baseRevision: 3,
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate and contradictory operations", () => {
    const result = canvasSyncSchema.safeParse({
      changes: {
        upsertNodes: [node("a"), node("a")],
        deleteNodeIds: ["a", "a"],
      },
      baseRevision: 3,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty change set", () => {
    const result = canvasSyncSchema.safeParse({
      changes: {},
      baseRevision: 3,
    });

    expect(result.success).toBe(false);
  });
});

describe("applyCanvasChanges", () => {
  it("replaces in place and appends new nodes", () => {
    const merged = applyCanvasChanges(
      [node("a"), node("b"), node("c")],
      [edge("e1", "a", "b"), edge("e2", "b", "c")],
      {
        upsertNodes: [node("b", { data: { label: "updated" } }), node("d")],
        deleteNodeIds: ["c"],
        upsertEdges: [edge("e3", "a", "d")],
        deleteEdgeIds: ["e2"],
      },
    );

    expect(merged.nodes.map((item) => item.id)).toEqual(["a", "b", "d"]);
    expect(merged.nodes[1].data).toEqual({ label: "updated" });
    expect(merged.edges).toEqual([edge("e1", "a", "b"), edge("e3", "a", "d")]);
  });

  it("cascades node deletes to attached edges", () => {
    const merged = applyCanvasChanges(
      [node("a"), node("b"), node("c")],
      [edge("e1", "a", "b"), edge("e2", "b", "c")],
      { deleteNodeIds: ["b"] },
    );

    expect(merged.nodes.map((item) => item.id)).toEqual(["a", "c"]);
    expect(merged.edges).toEqual([]);
  });

  it("leaves final graph validation to the merged snapshot", () => {
    const merged = applyCanvasChanges([node("a")], [], {
      upsertEdges: [edge("bad", "a", "missing")],
    });
    const result = canvasSnapshotSyncSchema.safeParse({
      ...merged,
      baseRevision: 1,
    });

    expect(result.success).toBe(false);
  });
});
