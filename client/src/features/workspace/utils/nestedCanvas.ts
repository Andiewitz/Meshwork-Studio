import type { Edge, Node } from "@xyflow/react";

export interface CanvasSnapshot {
  nodes: Node[];
  edges: Edge[];
}

export interface NestedCanvasLevel extends CanvasSnapshot {
  nodeId: string;
}

/**
 * Rebuild the persisted root document while the editor is displaying a nested
 * canvas. Navigation keeps parent levels in a stack, but persistence must never
 * send the currently displayed child as the workspace's root canvas.
 */
export function materializeRootCanvas(
  canvasStack: NestedCanvasLevel[],
  activeCanvas: CanvasSnapshot,
): CanvasSnapshot {
  let child = activeCanvas;

  for (let index = canvasStack.length - 1; index >= 0; index -= 1) {
    const level = canvasStack[index];
    child = {
      nodes: level.nodes.map((node) =>
        node.id === level.nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                subCanvas: { nodes: child.nodes, edges: child.edges },
              },
            }
          : node,
      ),
      edges: level.edges,
    };
  }

  return child;
}
