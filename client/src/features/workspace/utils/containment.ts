import type { Node } from "@xyflow/react";
import { CONTAINER_TYPES } from "./nodeRegistry";
import { getNodeDimensions } from "./nodeGeometry";

const CONTAINER_PADDING = { top: 48, right: 24, bottom: 24, left: 24 };

function nodeById(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((node) => [node.id, node]));
}

/** Resolves a node's canvas position through all of its parent containers. */
export function getAbsoluteNodePosition(
  node: Node,
  allNodes: Node[],
  visited = new Set<string>(),
): { x: number; y: number } {
  if (!node.parentId || visited.has(node.id)) return node.position;
  visited.add(node.id);
  const parent = nodeById(allNodes).get(node.parentId);
  if (!parent) return node.position;
  const parentPosition = getAbsoluteNodePosition(parent, allNodes, visited);
  return {
    x: node.position.x + parentPosition.x,
    y: node.position.y + parentPosition.y,
  };
}

function hierarchyDepth(node: Node, allNodes: Node[]): number {
  const byId = nodeById(allNodes);
  const visited = new Set<string>();
  let depth = 0;
  let current: Node | undefined = node;
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.parentId);
    if (current) depth += 1;
  }
  return depth;
}

function isDescendantOf(
  possibleDescendant: Node,
  ancestorId: string,
  allNodes: Node[],
): boolean {
  const byId = nodeById(allNodes);
  const visited = new Set<string>();
  let current: Node | undefined = possibleDescendant;
  while (current?.parentId && !visited.has(current.id)) {
    if (current.parentId === ancestorId) return true;
    visited.add(current.id);
    current = byId.get(current.parentId);
  }
  return false;
}

function fitsInside(child: Node, container: Node, allNodes: Node[]): boolean {
  const childPosition = getAbsoluteNodePosition(child, allNodes);
  const containerPosition = getAbsoluteNodePosition(container, allNodes);
  const childSize = getNodeDimensions(child);
  const containerSize = getNodeDimensions(container);

  return (
    childPosition.x >= containerPosition.x + CONTAINER_PADDING.left &&
    childPosition.y >= containerPosition.y + CONTAINER_PADDING.top &&
    childPosition.x + childSize.width <=
      containerPosition.x + containerSize.width - CONTAINER_PADDING.right &&
    childPosition.y + childSize.height <=
      containerPosition.y + containerSize.height - CONTAINER_PADDING.bottom
  );
}

/**
 * Finds the deepest container that fully contains a node. Positions returned
 * for a parent are always parent-local, as required by React Flow.
 */
export function calculateContainment(
  draggedNode: Node,
  allNodes: Node[],
): { parentId?: string; localPosition?: { x: number; y: number } } {
  const nodes = allNodes.map((node) =>
    node.id === draggedNode.id ? draggedNode : node,
  );
  const containers = nodes
    .filter(
      (node) =>
        node.id !== draggedNode.id &&
        CONTAINER_TYPES.has(node.type ?? "") &&
        !isDescendantOf(node, draggedNode.id, nodes) &&
        fitsInside(draggedNode, node, nodes),
    )
    .sort((a, b) => hierarchyDepth(b, nodes) - hierarchyDepth(a, nodes));
  const parent = containers[0];
  if (!parent) return {};

  const position = getAbsoluteNodePosition(draggedNode, nodes);
  const parentPosition = getAbsoluteNodePosition(parent, nodes);
  return {
    parentId: parent.id,
    localPosition: {
      x: position.x - parentPosition.x,
      y: position.y - parentPosition.y,
    },
  };
}

/** Calculates canvas coordinates when detaching a node from any depth. */
export function calculateGlobalPosition(
  node: Node,
  allNodes: Node[],
): { x: number; y: number } | undefined {
  if (!node.parentId) return undefined;
  return getAbsoluteNodePosition(node, allNodes);
}

/** Places parents before children, preserving input order for unrelated nodes. */
export function orderNodesByHierarchy(nodes: Node[]): Node[] {
  const remaining = [...nodes];
  const ordered: Node[] = [];
  const placed = new Set<string>();

  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (node) => !node.parentId || placed.has(node.parentId),
    );
    if (index === -1) {
      // A missing parent or cycle is left stable for the structural validator
      // to report; this helper must never drop persisted nodes.
      ordered.push(...remaining);
      break;
    }
    const [node] = remaining.splice(index, 1);
    ordered.push(node);
    placed.add(node.id);
  }

  return ordered;
}
