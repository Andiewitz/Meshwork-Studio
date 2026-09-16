import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  duplicateCanvasSubtrees,
  expandNodeSubtreeIds,
} from "@/features/workspace/utils/containment";

const nodes: Node[] = [
  {
    id: "vpc",
    type: "vpc",
    position: { x: 100, y: 100 },
    data: { label: "VPC" },
  },
  {
    id: "service",
    type: "server",
    parentId: "vpc",
    extent: "parent",
    position: { x: 40, y: 60 },
    data: { label: "Service" },
  },
  {
    id: "database",
    type: "database",
    parentId: "vpc",
    extent: "parent",
    position: { x: 40, y: 180 },
    data: { label: "Database" },
  },
];

const edges: Edge[] = [
  { id: "service-db", source: "service", target: "database" },
];

describe("container subtree mutations", () => {
  it("expands a container deletion to every descendant", () => {
    expect([...expandNodeSubtreeIds(nodes, ["vpc"])]).toEqual([
      "vpc",
      "service",
      "database",
    ]);
  });

  it("duplicates descendants and internal edges with remapped parents", () => {
    const copies = duplicateCanvasSubtrees(
      nodes,
      edges,
      ["vpc"],
      (node) => `${node.id}-copy`,
      (edge) => `${edge.id}-copy`,
    );

    expect(copies.nodes.map((node) => node.id)).toEqual([
      "vpc-copy",
      "service-copy",
      "database-copy",
    ]);
    expect(
      copies.nodes.find((node) => node.id === "service-copy")?.parentId,
    ).toBe("vpc-copy");
    expect(
      copies.nodes.find((node) => node.id === "vpc-copy")?.position,
    ).toEqual({
      x: 120,
      y: 120,
    });
    expect(
      copies.nodes.find((node) => node.id === "service-copy")?.position,
    ).toEqual({ x: 40, y: 60 });
    expect(copies.edges).toEqual([
      {
        id: "service-db-copy",
        source: "service-copy",
        target: "database-copy",
        selected: true,
      },
    ]);
  });
});
