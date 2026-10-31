import type { Edge, Node } from "@xyflow/react";

export interface CanvasSaveChanges {
  upsertNodes?: Node[];
  upsertEdges?: Record<string, unknown>[];
  deleteNodeIds?: string[];
  deleteEdgeIds?: string[];
}

export type CanvasSavePlan =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "delta"; changes: CanvasSaveChanges };

export function normalizeCanvasEdge(edge: Edge): Record<string, unknown> {
  return {
    ...edge,
    animated: edge.animated ? 1 : 0,
  };
}

function sameNode(current: Node, baseline: Node): boolean {
  return (
    current === baseline || JSON.stringify(current) === JSON.stringify(baseline)
  );
}

function sameEdge(current: Edge, baseline: Edge): boolean {
  return (
    JSON.stringify(normalizeCanvasEdge(current)) ===
    JSON.stringify(normalizeCanvasEdge(baseline))
  );
}

function preservesOrder(
  current: readonly { id: string }[],
  baseline: readonly { id: string }[],
): boolean {
  const baselineIds = new Set(baseline.map((item) => item.id));
  const currentIds = new Set(current.map((item) => item.id));
  let baselineIndex = 0;
  let sawNewItem = false;

  for (const item of current) {
    if (!baselineIds.has(item.id)) {
      sawNewItem = true;
      continue;
    }
    if (sawNewItem) return false;
    while (
      baselineIndex < baseline.length &&
      !currentIds.has(baseline[baselineIndex].id)
    ) {
      baselineIndex += 1;
    }
    if (baseline[baselineIndex]?.id !== item.id) return false;
    baselineIndex += 1;
  }

  return true;
}

/**
 * Build the smallest safe save payload. Reference equality keeps unchanged
 * React Flow nodes out of the deep comparison; fall back to a full snapshot
 * when item ordering changed or the delta is not actually smaller.
 */
export function planCanvasSave(
  currentNodes: Node[],
  currentEdges: Edge[],
  baselineNodes: Node[],
  baselineEdges: Edge[],
): CanvasSavePlan {
  if (currentNodes === baselineNodes && currentEdges === baselineEdges) {
    return { kind: "none" };
  }
  if (
    !preservesOrder(currentNodes, baselineNodes) ||
    !preservesOrder(currentEdges, baselineEdges)
  ) {
    return { kind: "full" };
  }

  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const baselineNodeById = new Map(
    baselineNodes.map((node) => [node.id, node]),
  );
  const currentEdgeById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  const baselineEdgeById = new Map(
    baselineEdges.map((edge) => [edge.id, edge]),
  );

  const upsertNodes: Node[] = [];
  for (const node of currentNodes) {
    const baseline = baselineNodeById.get(node.id);
    if (!baseline || !sameNode(node, baseline)) upsertNodes.push(node);
  }
  const deleteNodeIds = baselineNodes
    .filter((node) => !currentNodeById.has(node.id))
    .map((node) => node.id);

  const upsertEdges: Record<string, unknown>[] = [];
  for (const edge of currentEdges) {
    const baseline = baselineEdgeById.get(edge.id);
    if (!baseline || !sameEdge(edge, baseline)) {
      upsertEdges.push(normalizeCanvasEdge(edge));
    }
  }
  const deleteEdgeIds = baselineEdges
    .filter((edge) => !currentEdgeById.has(edge.id))
    .map((edge) => edge.id);

  const changed =
    upsertNodes.length +
    upsertEdges.length +
    deleteNodeIds.length +
    deleteEdgeIds.length;
  if (changed === 0) return { kind: "none" };
  if (changed * 2 > currentNodes.length + currentEdges.length) {
    return { kind: "full" };
  }

  return {
    kind: "delta",
    changes: {
      ...(upsertNodes.length ? { upsertNodes } : {}),
      ...(upsertEdges.length ? { upsertEdges } : {}),
      ...(deleteNodeIds.length ? { deleteNodeIds } : {}),
      ...(deleteEdgeIds.length ? { deleteEdgeIds } : {}),
    },
  };
}
