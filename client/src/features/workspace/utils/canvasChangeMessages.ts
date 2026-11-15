import type { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";

/** Ordered incremental messages for moving between two canvas snapshots. */
export function canvasChangeMessages(
  before: { nodes: Node[]; edges: Edge[] },
  after: { nodes: Node[]; edges: Edge[] },
): {
  removedEdges: EdgeChange[];
  nodes: NodeChange[];
  edges: EdgeChange[];
} {
  const oldNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const oldEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const newNodes = new Set(after.nodes.map((node) => node.id));
  const newEdges = new Set(after.edges.map((edge) => edge.id));
  return {
    removedEdges: before.edges
      .filter((edge) => !newEdges.has(edge.id))
      .map((edge) => ({ type: "remove", id: edge.id })),
    nodes: [
      ...before.nodes
        .filter((node) => !newNodes.has(node.id))
        .map((node) => ({ type: "remove" as const, id: node.id })),
      ...after.nodes
        .filter(
          (node) =>
            JSON.stringify(oldNodes.get(node.id)) !== JSON.stringify(node),
        )
        .map((item) =>
          oldNodes.has(item.id)
            ? { type: "replace" as const, id: item.id, item }
            : { type: "add" as const, item },
        ),
    ],
    edges: after.edges
      .filter(
        (edge) =>
          JSON.stringify(oldEdges.get(edge.id)) !== JSON.stringify(edge),
      )
      .map((item) =>
        oldEdges.has(item.id)
          ? { type: "replace" as const, id: item.id, item }
          : { type: "add" as const, item },
      ),
  };
}
