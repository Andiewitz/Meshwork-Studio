import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { planCanvasSave } from "@/lib/canvas-delta";

const node = (id: string, x = 0): Node => ({
  id,
  position: { x, y: 0 },
  data: { label: id },
});

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

const canvas = (count: number) => ({
  nodes: Array.from({ length: count }, (_, index) => node(`n${index}`)),
  edges: [edge("e1", "n0", "n1")],
});

describe("planCanvasSave", () => {
  it("returns none when the arrays are unchanged", () => {
    const baseline = canvas(10);
    expect(
      planCanvasSave(
        baseline.nodes,
        baseline.edges,
        baseline.nodes,
        baseline.edges,
      ),
    ).toEqual({ kind: "none" });
  });

  it("sends only edited nodes and deleted edges", () => {
    const baseline = canvas(10);
    const currentNodes = baseline.nodes.map((item) =>
      item.id === "n3" ? node("n3", 40) : item,
    );
    const currentEdges = [...baseline.edges, edge("e2", "n2", "n3")];

    const plan = planCanvasSave(
      currentNodes,
      currentEdges,
      baseline.nodes,
      baseline.edges,
    );

    expect(plan.kind).toBe("delta");
    if (plan.kind !== "delta") return;
    expect(plan.changes.upsertNodes?.map((item) => item.id)).toEqual(["n3"]);
    expect(plan.changes.upsertEdges).toEqual([
      { id: "e2", source: "n2", target: "n3", animated: 0 },
    ]);
  });

  it("keeps a two-node edit under 20 KB on a 5,000-node canvas", () => {
    const nodes = Array.from({ length: 5_000 }, (_, index) =>
      node(`n${index}`),
    );
    const edges = [edge("e1", "n0", "n1")];
    const currentNodes = nodes.map((item) =>
      item.id === "n10" || item.id === "n20" ? node(item.id, 100) : item,
    );

    const plan = planCanvasSave(currentNodes, edges, nodes, edges);

    expect(plan.kind).toBe("delta");
    if (plan.kind !== "delta") return;
    expect(plan.changes.upsertNodes).toHaveLength(2);
    expect(
      Buffer.byteLength(JSON.stringify(plan.changes), "utf8"),
    ).toBeLessThan(20 * 1024);
  });

  it("uses deletions and falls back to full for large edits", () => {
    const baseline = canvas(4);
    const currentNodes = baseline.nodes.slice(0, 2);

    expect(
      planCanvasSave(
        currentNodes,
        baseline.edges,
        baseline.nodes,
        baseline.edges,
      ),
    ).toEqual({ kind: "full" });
  });

  it("falls back to full when order changes", () => {
    const baseline = canvas(10);
    const currentNodes = [...baseline.nodes].reverse();

    expect(
      planCanvasSave(
        currentNodes,
        baseline.edges,
        baseline.nodes,
        baseline.edges,
      ),
    ).toEqual({ kind: "full" });
  });

  it("treats animated booleans and numbers as equal", () => {
    const baseline = canvas(10);
    const baselineEdges = baseline.edges.map((item) => ({
      ...item,
      animated: true,
    }));
    const currentEdges = baseline.edges.map((item) => ({
      ...item,
      animated: 1,
    })) as unknown as Edge[];

    expect(
      planCanvasSave(
        baseline.nodes,
        currentEdges,
        baseline.nodes,
        baselineEdges,
      ),
    ).toEqual({ kind: "none" });
  });
});
