import type { Edge, Node } from "@xyflow/react";
import type { EditCanvasToolArgs } from "./canvasToolExecutor";

export interface SelectionScope {
  nodeIds: string[];
  edgeIds: string[];
}

/** Selection scope permits edits/deletions of selected existing objects only. */
export function assertSelectionOperation(
  args: EditCanvasToolArgs,
  scope: SelectionScope,
): void {
  const nodes = new Set(scope.nodeIds);
  const edges = new Set(scope.edgeIds);
  if (!nodes.size && !edges.size)
    throw new Error(
      "Select at least one node or connection before using selection scope.",
    );
  if (
    args.action === "replace_all" ||
    args.action === "reorganize" ||
    args.action === "add" ||
    args.edges?.length
  )
    throw new Error(
      "Selection scope only allows changes to selected existing items. Use entire canvas to add or reorganize items.",
    );
  if (
    args.nodes?.some((node) => !node.id || !nodes.has(node.id)) ||
    args.deleteNodeIds?.some((id) => !nodes.has(id)) ||
    args.deleteEdgeIds?.some((id) => !edges.has(id))
  )
    throw new Error(
      "The AI requested changes outside the selection. No changes were applied.",
    );
}

/** Catch indirect changes, including cascading deletion of unselected children or edges. */
export function assertSelectionResult(
  beforeNodes: Node[],
  beforeEdges: Edge[],
  afterNodes: Node[],
  afterEdges: Edge[],
  scope: SelectionScope,
): void {
  const unchangedOutside = <T extends { id: string }>(
    before: T[],
    after: T[],
    allowed: string[],
  ) => {
    const permitted = new Set(allowed);
    const originals = new Map(before.map((item) => [item.id, item]));
    const updated = new Map(after.map((item) => [item.id, item]));
    return (
      after.every((item) => originals.has(item.id)) &&
      before.every(
        (item) =>
          permitted.has(item.id) ||
          JSON.stringify(item) === JSON.stringify(updated.get(item.id)),
      )
    );
  };
  if (
    !unchangedOutside(beforeNodes, afterNodes, scope.nodeIds) ||
    !unchangedOutside(beforeEdges, afterEdges, scope.edgeIds)
  )
    throw new Error(
      "This change would affect items outside the selection. Select those items too, or use entire canvas. No changes were applied.",
    );
}
