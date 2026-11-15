import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  assertSelectionOperation,
  assertSelectionResult,
} from "@/features/workspace/agent/tools/canvasEditScope";
import { executeEditCanvas } from "@/features/workspace/agent/tools/canvasToolExecutor";

const nodes: Node[] = [
  { id: "a", type: "server", position: { x: 0, y: 0 }, data: { label: "A" } },
  { id: "b", type: "server", position: { x: 200, y: 0 }, data: { label: "B" } },
];
const edges: Edge[] = [{ id: "ab", source: "a", target: "b" }];
const scope = { nodeIds: ["a"], edgeIds: [] };

describe("AI selection scope", () => {
  it("allows an update to a selected existing node", () => {
    const args = {
      action: "update" as const,
      nodes: [{ id: "a", type: "server", label: "Updated" }],
    };
    expect(() => assertSelectionOperation(args, scope)).not.toThrow();
    const result = executeEditCanvas(nodes, edges, args);
    expect(() =>
      assertSelectionResult(nodes, edges, result.nodes, result.edges, scope),
    ).not.toThrow();
    expect(result.nodes[0].data.label).toBe("Updated");
  });

  it("rejects out-of-scope targets, additions and replacements", () => {
    expect(() =>
      assertSelectionOperation(
        { action: "delete", deleteNodeIds: ["b"] },
        scope,
      ),
    ).toThrow(/outside the selection/);
    expect(() =>
      assertSelectionOperation(
        { action: "add", nodes: [{ type: "server" }] },
        scope,
      ),
    ).toThrow(/only allows/);
    expect(() =>
      assertSelectionOperation({ action: "replace_all" }, scope),
    ).toThrow(/only allows/);
    expect(() =>
      assertSelectionOperation(
        { action: "delete", deleteEdgeIds: ["ab"] },
        scope,
      ),
    ).toThrow(/outside the selection/);
  });

  it("rejects cascading deletion of unselected edges and permits explicitly selected ones", () => {
    const args = { action: "delete" as const, deleteNodeIds: ["a"] };
    const result = executeEditCanvas(nodes, edges, args);
    expect(() =>
      assertSelectionResult(nodes, edges, result.nodes, result.edges, scope),
    ).toThrow(/outside the selection/);
    expect(() =>
      assertSelectionResult(nodes, edges, result.nodes, result.edges, {
        ...scope,
        edgeIds: ["ab"],
      }),
    ).not.toThrow();
  });

  it("rejects deletion of unselected descendants and any generated object", () => {
    const children: Node[] = [
      { ...nodes[0], type: "vpc" },
      { ...nodes[1], parentId: "a" },
    ];
    const result = executeEditCanvas(children, [], {
      action: "delete",
      deleteNodeIds: ["a"],
    });
    expect(() =>
      assertSelectionResult(children, [], result.nodes, result.edges, scope),
    ).toThrow(/outside the selection/);
    expect(() =>
      assertSelectionResult(
        nodes,
        edges,
        [...nodes, { ...nodes[0], id: "new" }],
        edges,
        scope,
      ),
    ).toThrow(/outside the selection/);
  });
});
