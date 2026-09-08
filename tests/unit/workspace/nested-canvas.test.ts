import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  materializeRootCanvas,
  type CanvasSnapshot,
  type NestedCanvasLevel,
} from "@/features/workspace/utils/nestedCanvas";

const node = (id: string, label: string): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: { label },
});

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

describe("materializeRootCanvas", () => {
  it("keeps an active nested canvas from replacing the root document", () => {
    const rootNodes = [node("parent", "Parent"), node("sibling", "Sibling")];
    const activeCanvas: CanvasSnapshot = {
      nodes: [node("child", "Child")],
      edges: [],
    };
    const stack: NestedCanvasLevel[] = [
      {
        nodeId: "parent",
        nodes: rootNodes,
        edges: [edge("root-edge", "parent", "sibling")],
      },
    ];

    const result = materializeRootCanvas(stack, activeCanvas);

    expect(result.nodes.map((item) => item.id)).toEqual(["parent", "sibling"]);
    expect(result.edges.map((item) => item.id)).toEqual(["root-edge"]);
    expect(result.nodes[0].data.subCanvas).toEqual(activeCanvas);
  });

  it("folds a deeply nested edit back through every parent level", () => {
    const root: NestedCanvasLevel = {
      nodeId: "outer",
      nodes: [node("outer", "Outer"), node("root-sibling", "Root sibling")],
      edges: [edge("root-edge", "outer", "root-sibling")],
    };
    const middle: NestedCanvasLevel = {
      nodeId: "inner",
      nodes: [node("inner", "Inner"), node("middle-sibling", "Middle sibling")],
      edges: [edge("middle-edge", "inner", "middle-sibling")],
    };
    const active: CanvasSnapshot = {
      nodes: [node("deepest", "Deepest")],
      edges: [],
    };

    const result = materializeRootCanvas([root, middle], active);
    const middleCanvas = result.nodes[0].data.subCanvas as CanvasSnapshot;
    const deepestCanvas = middleCanvas.nodes[0].data
      .subCanvas as CanvasSnapshot;

    expect(result.edges).toEqual(root.edges);
    expect(middleCanvas.edges).toEqual(middle.edges);
    expect(deepestCanvas).toEqual(active);
  });

  it("returns the active canvas unchanged at the root level", () => {
    const active: CanvasSnapshot = {
      nodes: [node("root", "Root")],
      edges: [],
    };

    expect(materializeRootCanvas([], active)).toBe(active);
  });
});
