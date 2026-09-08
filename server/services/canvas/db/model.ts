// Canonical canvas document types + storage contract.
// Persistence lives in dynamo.ts (the only implementation).

export interface CanvasNode {
  id: string;
  workspaceId?: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string | null;
  extent?: string | null;
  style?: Record<string, unknown> | null;
  width?: number | null;
  height?: number | null;
  measured?: Record<string, unknown> | null;
}

export interface CanvasEdge {
  id: string;
  workspaceId?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string | null;
  data?: Record<string, unknown> | null;
  style?: Record<string, unknown> | null;
  markerEnd?: Record<string, unknown> | null;
  animated?: boolean | number | null;
}

export interface ICanvasStorage {
  getNodes(workspaceId: string): Promise<CanvasNode[]>;
  getEdges(workspaceId: string): Promise<CanvasEdge[]>;
  getCanvasRevision(workspaceId: string): Promise<number>;
  /** Replace-set semantics: items missing from the payload are deleted. */
  syncCanvas(
    workspaceId: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    expectedRevision?: number,
  ): Promise<number>;
  duplicateCanvas(
    fromWorkspaceId: string,
    toWorkspaceId: string,
  ): Promise<void>;
  /** Explicit bulk cleanup; ownership resolved by the caller. */
  deleteWorkspaces(workspaceIds: string[]): Promise<void>;
}
