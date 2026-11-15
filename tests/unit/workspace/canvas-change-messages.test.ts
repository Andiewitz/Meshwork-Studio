import { describe, expect, it } from "vitest";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type Edge,
} from "@xyflow/react";
import { canvasChangeMessages } from "@/features/workspace/utils/canvasChangeMessages";

describe("collaborative canvas history changes", () => {
  it("replays an edit and its reversal without losing unrelated nodes", () => {
    const nodes: Node[] = [
      {
        id: "a",
        type: "server",
        position: { x: 0, y: 0 },
        data: { label: "Before" },
      },
      {
        id: "b",
        type: "server",
        position: { x: 100, y: 0 },
        data: { label: "Keep" },
      },
    ];
    const edges: Edge[] = [{ id: "ab", source: "a", target: "b" }];
    const before = { nodes, edges };
    const after = {
      nodes: [
        { ...nodes[0], data: { label: "After" } },
        {
          id: "c",
          type: "database",
          position: { x: 200, y: 0 },
          data: { label: "New" },
        },
        nodes[1],
      ],
      edges: [],
    };
    const apply = (state: typeof before, next: typeof before) => {
      const changes = canvasChangeMessages(state, next);
      return {
        nodes: applyNodeChanges(changes.nodes, state.nodes),
        edges: applyEdgeChanges(
          changes.edges,
          applyEdgeChanges(changes.removedEdges, state.edges),
        ),
      };
    };
    const applied = apply(before, after);
    expect(applied.nodes.map((node) => node.id).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(applied.nodes.find((node) => node.id === "a")?.data.label).toBe(
      "After",
    );
    expect(applied.edges).toEqual([]);
    const undone = apply(applied, before);
    expect(undone.nodes.map((node) => node.id).sort()).toEqual(["a", "b"]);
    expect(undone.nodes.find((node) => node.id === "a")?.data.label).toBe(
      "Before",
    );
    expect(undone.edges).toEqual(edges);
  });
  it("does not broadcast unchanged items", () => {
    const graph = {
      nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    expect(canvasChangeMessages(graph, graph)).toEqual({
      removedEdges: [],
      nodes: [],
      edges: [],
    });
  });
});
