import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { canvasSnapshotSyncSchema } from "@shared/canvas";
import {
  searchNodeCatalog,
  nodeTypes,
} from "@/features/workspace/utils/nodeTypes";
import { createConnections } from "@/features/workspace/utils/connectionStyles";
import { canvasJsonSchema } from "@/features/workspace/utils/exportCanvas";
import { getNodeSize } from "@/features/workspace/utils/nodeRegistry";
import { nodePresentation } from "@/components/canvas/nodes/nodePresentation";

describe("data pipeline nodes", () => {
  it("provides searchable roles with registered renderers", () => {
    const ids = searchNodeCatalog("data pipeline").map((node) => node.type);
    const expected = [
      "data-source",
      "data-transform",
      "data-dataset",
      "data-model",
      "data-destination",
      "data-schedule",
    ];
    expect(ids).toEqual(expect.arrayContaining(expected));
    for (const id of expected) {
      expect(nodeTypes[id]).toBeDefined();
      expect(getNodeSize(id).w).toBeGreaterThan(0);
    }
    expect(nodePresentation("data-transform").layer).toBe("compute");
    expect(nodePresentation("data-dataset").layer).toBe("data");
  });
  it("connects mixed node types and round-trips graph metadata", () => {
    const nodes: Node[] = [
      {
        id: "source",
        type: "data-source",
        position: { x: 0, y: 0 },
        data: { label: "Orders" },
      },
      {
        id: "transform",
        type: "data-transform",
        position: { x: 250, y: 0 },
        data: { label: "Clean orders", technology: "SQL" },
      },
      {
        id: "database",
        type: "database",
        position: { x: 500, y: 0 },
        data: { label: "Warehouse", provider: "AWS" },
      },
    ];
    const first = createConnections(
      [],
      {
        source: "source",
        target: "transform",
        sourceHandle: null,
        targetHandle: null,
      },
      "sync",
      "step",
      "solid",
      true,
      false,
      nodes,
      () => "e1",
    );
    const second = createConnections(
      first.edges,
      {
        source: "transform",
        target: "database",
        sourceHandle: null,
        targetHandle: null,
      },
      "sync",
      "step",
      "solid",
      true,
      false,
      nodes,
      () => "e2",
    );
    const edges = second.edges.map((edge) =>
      edge.id === "e2"
        ? {
            ...edge,
            data: {
              ...edge.data,
              relationshipType: "transforms into",
              dataExchanged: "clean orders",
            },
          }
        : edge,
    );
    const snapshot = canvasSnapshotSyncSchema.parse({
      nodes,
      edges,
      baseRevision: 0,
    });
    const exported = canvasJsonSchema.parse({
      title: "Pipeline",
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      exportedAt: "now",
      version: 1,
    });
    expect(exported.nodes.map((node) => node.type)).toEqual([
      "data-source",
      "data-transform",
      "database",
    ]);
    expect(exported.nodes[1].data.technology).toBe("SQL");
    expect(exported.edges[1].data).toMatchObject({
      relationshipType: "transforms into",
      dataExchanged: "clean orders",
    });
  });
});
