import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { reviewConnections } from "@/features/workspace/utils/connectionReview";

const nodes: Node[] = [
  { id: "a", position: { x: 0, y: 0 }, data: { label: "Frontend" } },
  { id: "b", position: { x: 100, y: 0 }, data: { label: "API" } },
];
const edge: Edge = { id: "ab", source: "a", target: "b", data: {} };

describe("optional connection review", () => {
  it("reports only enabled missing fields without modifying the canvas", () => {
    const graph = JSON.stringify({ nodes, edges: [edge] });
    expect(
      reviewConnections(nodes, [edge], {
        description: true,
        protocol: true,
        dataExchanged: false,
      }),
    ).toEqual([
      {
        edgeId: "ab",
        source: "Frontend",
        target: "API",
        missing: ["Description or relationship", "Protocol"],
      },
    ]);
    expect(JSON.stringify({ nodes, edges: [edge] })).toBe(graph);
    expect(
      reviewConnections(nodes, [edge], {
        description: false,
        protocol: false,
        dataExchanged: false,
      }),
    ).toEqual([]);
  });
  it("accepts existing labels and relationships but does not infer a protocol from a label", () => {
    const labeled: Edge = {
      ...edge,
      label: "HTTPS",
      data: { relationshipType: "calls", dataExchanged: "orders" },
    };
    expect(
      reviewConnections(nodes, [labeled], {
        description: true,
        protocol: true,
        dataExchanged: true,
      })[0].missing,
    ).toEqual(["Protocol"]);
    expect(
      reviewConnections(
        nodes,
        [{ ...labeled, data: { ...labeled.data, protocol: "HTTPS" } }],
        { description: true, protocol: true, dataExchanged: true },
      ),
    ).toEqual([]);
  });
  it("handles whitespace, unnamed endpoints, and empty graphs", () => {
    const unnamed: Edge = {
      ...edge,
      source: "missing",
      data: { description: "  ", protocol: " " },
    };
    expect(
      reviewConnections([], [unnamed], {
        description: true,
        protocol: true,
        dataExchanged: false,
      })[0],
    ).toMatchObject({
      source: "missing",
      target: "b",
      missing: ["Description or relationship", "Protocol"],
    });
    expect(
      reviewConnections(nodes, [], {
        description: true,
        protocol: true,
        dataExchanged: true,
      }),
    ).toEqual([]);
  });
});
