import { describe, expect, it } from "vitest";
import {
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  applyConnectionPreset,
  createConnections,
  dashForStyle,
} from "@/features/workspace/utils/connectionStyles";
import { canvasSnapshotSyncSchema } from "@shared/canvas";
import { planCanvasSave } from "@/lib/canvas-delta";

const nodes: Node[] = [
  { id: "client", type: "app", position: { x: 0, y: 0 }, data: {} },
  { id: "service", type: "microservice", position: { x: 300, y: 0 }, data: {} },
];
const connection: Connection = {
  source: "client",
  sourceHandle: "right",
  target: "service",
  targetHandle: "left-target",
};
function create(
  preset: Parameters<typeof createConnections>[2],
  existing: Edge[] = [],
) {
  let id = 0;
  return createConnections(
    existing,
    connection,
    preset,
    "step",
    preset === "async" ? "dashed" : "solid",
    true,
    false,
    nodes,
    () => `edge-${++id}`,
  );
}

describe("connection presets", () => {
  it("creates two independent directed arrows with distinct handles and labels", () => {
    const { edges } = create("request-response");
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      source: "client",
      target: "service",
      label: "request",
      markerEnd: { type: MarkerType.ArrowClosed },
    });
    expect(edges[1]).toMatchObject({
      source: "service",
      target: "client",
      sourceHandle: "bottom",
      targetHandle: "bottom-target",
      label: "response",
      markerEnd: { type: MarkerType.ArrowClosed },
    });
    expect(
      canvasSnapshotSyncSchema.safeParse({ nodes, edges, baseRevision: 0 })
        .success,
    ).toBe(true);
  });
  it("does not add a partial pair when one of the connections already exists", () => {
    const original = create("sync").edges;
    expect(create("request-response", original)).toEqual({
      edges: original,
      added: [],
    });
  });
  it("adds a dashed event and preserves custom properties when updating a line", () => {
    const line = create("async").edges[0];
    expect(line.style?.strokeDasharray).toBe(dashForStyle("dashed"));
    const changed = applyConnectionPreset(
      {
        ...line,
        label: "publish",
        data: { note: "keep" },
        style: { ...line.style, opacity: 0.5 },
      },
      "primary",
      false,
    );
    expect(changed).toMatchObject({
      label: "publish",
      data: { note: "keep", connectionKind: "primary" },
      style: { stroke: "#1455b8", opacity: 0.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#1455b8" },
    });
    expect(changed.style?.strokeDasharray).toBeUndefined();
  });
  it("uses a different side for the return path when the request uses bottom handles", () => {
    const bottom = {
      ...connection,
      sourceHandle: "bottom",
      targetHandle: "bottom-target",
    };
    const result = createConnections(
      [],
      bottom,
      "request-response",
      "step",
      "solid",
      true,
      false,
      nodes,
      () => crypto.randomUUID(),
    );
    expect(result.edges[1]).toMatchObject({
      sourceHandle: "top",
      targetHandle: "top-target",
    });
  });
  it("keeps both labeled arrows in the save payload", () => {
    const { edges } = create("request-response");
    const save = planCanvasSave(nodes, edges, nodes, []);
    if (save.kind === "delta") {
      expect(save.changes.upsertEdges).toHaveLength(2);
      expect(save.changes.upsertEdges?.map((edge) => edge.label)).toEqual([
        "request",
        "response",
      ]);
    } else {
      expect(save.kind).toBe("full");
      expect(
        canvasSnapshotSyncSchema
          .parse({ nodes, edges, baseRevision: 0 })
          .edges.map((edge) => edge.label),
      ).toEqual(["request", "response"]);
    }
  });
});
