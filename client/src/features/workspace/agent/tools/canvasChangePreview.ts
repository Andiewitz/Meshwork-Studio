import type { Edge, Node } from "@xyflow/react";
import type { EditCanvasToolArgs } from "./canvasToolExecutor";

export interface CanvasChangeItem {
  id: string;
  label: string;
}

export interface CanvasChangePreview {
  addedNodes: CanvasChangeItem[];
  changedNodes: CanvasChangeItem[];
  removedNodes: CanvasChangeItem[];
  addedEdges: CanvasChangeItem[];
  changedEdges: CanvasChangeItem[];
  removedEdges: CanvasChangeItem[];
  requiresReview: boolean;
}

export function canvasMatchesPreview(
  base: string,
  nodes: Node[],
  edges: Edge[],
): boolean {
  return base === JSON.stringify({ nodes, edges });
}

/** The full graph is compared so that indirect cascade effects are visible. */
export function describeCanvasChanges(
  beforeNodes: Node[],
  beforeEdges: Edge[],
  afterNodes: Node[],
  afterEdges: Edge[],
  operations: EditCanvasToolArgs[] = [],
): CanvasChangePreview {
  const labelNode = (node: Node) =>
    String(node.data?.label || node.type || node.id);
  const labelNodeWithContent = (node: Node) =>
    `${labelNode(node)}${node.data?.subCanvas ? " (contains a nested canvas)" : ""}`;
  const names = new Map(
    [...beforeNodes, ...afterNodes].map((node) => [node.id, labelNode(node)]),
  );
  const labelEdge = (edge: Edge) =>
    `${names.get(edge.source) ?? edge.source} → ${names.get(edge.target) ?? edge.target}${edge.label ? ` (${String(edge.label)})` : ""}`;
  function diff<T extends { id: string }>(
    before: T[],
    after: T[],
    label: (item: T) => string,
  ) {
    const old = new Map(before.map((item) => [item.id, item]));
    const next = new Map(after.map((item) => [item.id, item]));
    const item = (value: T) => ({ id: value.id, label: label(value) });
    return {
      added: after.filter((value) => !old.has(value.id)).map(item),
      changed: after
        .filter(
          (value) =>
            old.has(value.id) &&
            JSON.stringify(old.get(value.id)) !== JSON.stringify(value),
        )
        .map(item),
      removed: before.filter((value) => !next.has(value.id)).map(item),
    };
  }
  const n = diff(beforeNodes, afterNodes, labelNodeWithContent);
  const e = diff(beforeEdges, afterEdges, labelEdge);
  const total =
    n.added.length +
    n.changed.length +
    n.removed.length +
    e.added.length +
    e.changed.length +
    e.removed.length;
  return {
    addedNodes: n.added,
    changedNodes: n.changed,
    removedNodes: n.removed,
    addedEdges: e.added,
    changedEdges: e.changed,
    removedEdges: e.removed,
    requiresReview:
      n.removed.length > 0 ||
      e.removed.length > 0 ||
      total >= 5 ||
      operations.some(
        (op) => op.action === "replace_all" || op.action === "reorganize",
      ),
  };
}
