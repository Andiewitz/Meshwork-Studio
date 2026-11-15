import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  arrangeCanvas,
  type LayoutStrategy,
} from "@/features/workspace/utils/canvasLayout";
import { getNodeDimensions } from "@/features/workspace/utils/nodeGeometry";

const make = (
  id: string,
  x: number,
  y: number,
  width = 120,
  height = 72,
): Node => ({
  id,
  type: "server",
  position: { x, y },
  width,
  height,
  data: { label: id },
});
const overlap = (a: Node, b: Node) => {
  const x = getNodeDimensions(a);
  const y = getNodeDimensions(b);
  return (
    a.position.x < b.position.x + y.width &&
    a.position.x + x.width > b.position.x &&
    a.position.y < b.position.y + y.height &&
    a.position.y + x.height > b.position.y
  );
};

describe("canvas layout proposals", () => {
  it.each(["flow", "hierarchy", "grid"] as LayoutStrategy[])(
    "arranges mixed-sized nodes without overlap using %s",
    (strategy) => {
      const nodes = [
        make("a", 0, 0, 180, 100),
        make("b", 20, 20, 100, 160),
        make("c", 30, 30, 140, 80),
      ];
      const input = JSON.stringify(nodes);
      const result = arrangeCanvas(nodes, [], { strategy, scope: "canvas" });
      expect(result.error).toBeUndefined();
      for (let a = 0; a < result.nodes.length; a++)
        for (let b = a + 1; b < result.nodes.length; b++)
          expect(overlap(result.nodes[a], result.nodes[b])).toBe(false);
      expect(JSON.stringify(nodes)).toBe(input);
    },
  );
  it("uses connections to order flow and hierarchy", () => {
    const nodes = [make("c", 0, 0), make("a", 0, 0), make("b", 0, 0)];
    const edges: Edge[] = [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
    ];
    const flow = arrangeCanvas(nodes, edges, {
      strategy: "flow",
      scope: "canvas",
    });
    const vertical = arrangeCanvas(nodes, edges, {
      strategy: "hierarchy",
      scope: "canvas",
    });
    const pos = (id: string, result: typeof flow) =>
      result.nodes.find((node) => node.id === id)!.position;
    expect(pos("a", flow).x).toBeLessThan(pos("b", flow).x);
    expect(pos("b", flow).x).toBeLessThan(pos("c", flow).x);
    expect(pos("a", vertical).y).toBeLessThan(pos("b", vertical).y);
    expect(pos("b", vertical).y).toBeLessThan(pos("c", vertical).y);
  });
  it("warns about cycles without dropping nodes", () => {
    const nodes = [make("a", 0, 0), make("b", 0, 0), make("c", 0, 0)];
    const edges: Edge[] = [
      { id: "ab", source: "a", target: "b" },
      { id: "ba", source: "b", target: "a" },
      { id: "bc", source: "b", target: "c" },
    ];
    const result = arrangeCanvas(nodes, edges, {
      strategy: "flow",
      scope: "canvas",
    });
    expect(result.nodes).toHaveLength(3);
    expect(result.warnings.join(" ")).toContain("cycle");
  });
  it("keeps pinned nodes and ancestors of pinned children in place", () => {
    const container = { ...make("parent", 20, 40, 500, 350), type: "vpc" };
    const child = {
      ...make("child", 40, 60),
      parentId: "parent",
      data: { layoutPinned: true },
    };
    const other = make("other", 100, 100);
    const result = arrangeCanvas([container, child, other], [], {
      strategy: "grid",
      scope: "canvas",
    });
    expect(result.nodes.find((node) => node.id === "parent")?.position).toEqual(
      container.position,
    );
    expect(result.nodes.find((node) => node.id === "child")?.position).toEqual(
      child.position,
    );
    expect(result.fixedIds).toContain("parent");
  });
  it("does not move unselected siblings and rejects mixed-parent selections", () => {
    const parent = { ...make("p", 0, 0, 600, 400), type: "vpc" };
    const a = { ...make("a", 30, 50), parentId: "p" };
    const b = { ...make("b", 300, 200), parentId: "p" };
    const fixed = { ...make("fixed", 180, 50), parentId: "p" };
    const result = arrangeCanvas([parent, a, b, fixed], [], {
      strategy: "grid",
      scope: "selection",
      selectedIds: ["a", "b"],
    });
    expect(result.nodes.find((node) => node.id === "fixed")).toEqual(fixed);
    expect(
      result.nodes
        .filter((node) => node.parentId === "p")
        .every((node) => node.position.x >= 24 && node.position.y >= 48),
    ).toBe(true);
    expect(
      arrangeCanvas([parent, a, b], [], {
        strategy: "flow",
        scope: "selection",
        selectedIds: ["p", "a"],
      }).error,
    ).toContain("same container");
  });
  it("leaves a constrained container unchanged if nodes cannot fit", () => {
    const parent = { ...make("p", 0, 0, 160, 130), type: "vpc" };
    const a = { ...make("a", 5, 10), parentId: "p" };
    const b = { ...make("b", 10, 10), parentId: "p" };
    const result = arrangeCanvas([parent, a, b], [], {
      strategy: "grid",
      scope: "selection",
      selectedIds: ["a", "b"],
    });
    expect(result.nodes).toEqual([parent, a, b]);
    expect(result.warnings.join(" ")).toContain("Not enough space");
  });
  it("arranges swimlane children without moving the lane or pinned nodes", () => {
    const lane = { ...make("lane", 100, 100, 700, 400), type: "workflow-lane" };
    const a = {
      ...make("a", 40, 60),
      parentId: "lane",
      data: { layoutPinned: true },
    };
    const b = { ...make("b", 400, 200), parentId: "lane" };
    const c = { ...make("c", 500, 240), parentId: "lane" };
    const result = arrangeCanvas(
      [lane, a, b, c],
      [{ id: "bc", source: "b", target: "c" }],
      { strategy: "swimlanes", scope: "selection", selectedIds: ["lane"] },
    );
    expect(result.nodes[0]).toEqual(lane);
    expect(result.nodes[1]).toEqual(a);
    expect(result.fixedIds).toContain("a");
    expect(result.nodes[2].parentId).toBe("lane");
    expect(result.nodes[3].parentId).toBe("lane");
    expect(result.movedIds.length).toBeGreaterThan(0);
  });
});
