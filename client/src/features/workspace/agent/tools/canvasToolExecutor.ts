import type { Node, Edge } from "@xyflow/react";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";

export interface EditCanvasNodeInput {
  id?: string;
  type: string;
  label?: string;
  description?: string;
  position?: { x: number; y: number };
  parentId?: string;
  accentColor?: string;
  tags?: string[];
  provider?: string;
  note?: string;
}

export interface EditCanvasEdgeInput {
  id?: string;
  source: string;
  target: string;
  label?: string;
  dashed?: boolean;
  animated?: boolean;
  color?: string;
}

export interface EditCanvasToolArgs {
  action?: "add" | "update" | "delete" | "replace_all" | "reorganize";
  nodes?: EditCanvasNodeInput[];
  edges?: EditCanvasEdgeInput[];
  deleteNodeIds?: string[];
  deleteEdgeIds?: string[];
  explanation?: string;
}

export interface CanvasExecutionResult {
  nodes: Node[];
  edges: Edge[];
  summary: string;
  applied: boolean;
}

const DEFAULT_NODE_SIZES: Record<string, { w: number; h: number }> = {
  server: { w: 168, h: 96 },
  database: { w: 144, h: 120 },
  storage: { w: 144, h: 120 },
  microservice: { w: 168, h: 72 },
  cache: { w: 144, h: 120 },
  worker: { w: 168, h: 72 },
  logic: { w: 120, h: 72 },
  user: { w: 96, h: 96 },
  app: { w: 168, h: 72 },
  search: { w: 144, h: 120 },
  gateway: { w: 192, h: 72 },
  loadBalancer: { w: 192, h: 72 },
  cdn: { w: 192, h: 72 },
  bus: { w: 192, h: 72 },
  queue: { w: 192, h: 72 },
  route53: { w: 192, h: 72 },
  vpc: { w: 408, h: 312 },
  region: { w: 600, h: 408 },
  "k8s-namespace": { w: 408, h: 312 },
  "k8s-pod": { w: 144, h: 96 },
  "k8s-deployment": { w: 192, h: 96 },
  "k8s-service": { w: 168, h: 72 },
};

/**
 * Executes the `edit_canvas` tool call on current ReactFlow canvas state
 */
export function executeEditCanvas(
  currentNodes: Node[],
  currentEdges: Edge[],
  args: EditCanvasToolArgs,
  viewportCenter: { x: number; y: number } = { x: 300, y: 200 },
): CanvasExecutionResult {
  const action =
    args.action || (currentNodes.length === 0 ? "replace_all" : "add");
  const rawNodes = args.nodes || [];
  const rawEdges = args.edges || [];
  const deleteNodeIds = new Set(args.deleteNodeIds || []);
  const deleteEdgeIds = new Set(args.deleteEdgeIds || []);

  // 1. Full Replacement Action
  if (action === "replace_all") {
    const rawPayload = {
      nodes: rawNodes.map((n, idx) => ({
        id: n.id || `node-${idx + 1}`,
        type: n.type,
        position: n.position || {
          x: viewportCenter.x + (idx % 3) * 240 - 240,
          y: viewportCenter.y + Math.floor(idx / 3) * 160 - 80,
        },
        data: {
          label: n.label || n.type,
          description: n.description || "",
          provider: n.provider,
          tags: n.tags || [],
          accentColor: n.accentColor,
          note: n.note,
        },
        parentId: n.parentId,
      })),
      edges: rawEdges.map((e, idx) => ({
        id: e.id || `edge-${idx + 1}`,
        source: e.source,
        target: e.target,
        label: e.label,
        style: e.dashed ? { strokeDasharray: "5,5" } : undefined,
      })),
    };

    const repaired = validateAndRepairCanvas(rawPayload);
    if (!repaired) {
      return {
        nodes: currentNodes,
        edges: currentEdges,
        summary: "Could not format valid canvas components.",
        applied: false,
      };
    }

    return {
      nodes: repaired.nodes,
      edges: repaired.edges,
      summary:
        args.explanation ||
        `Created new architecture with ${repaired.nodes.length} nodes and ${repaired.edges.length} edges.`,
      applied: true,
    };
  }

  // 2. Incremental Mutations (add, update, delete)
  let workingNodes = [...currentNodes];
  let workingEdges = [...currentEdges];

  // A. Process Deletions
  if (deleteNodeIds.size > 0) {
    workingNodes = workingNodes.filter((n) => !deleteNodeIds.has(n.id));
    workingEdges = workingEdges.filter(
      (e) => !deleteNodeIds.has(e.source) && !deleteNodeIds.has(e.target),
    );
  }
  if (deleteEdgeIds.size > 0) {
    workingEdges = workingEdges.filter((e) => !deleteEdgeIds.has(e.id));
  }

  // B. Process Updates to existing nodes
  const existingNodeMap = new Map(workingNodes.map((n) => [n.id, n]));
  const addedNodes: Node[] = [];

  rawNodes.forEach((incoming, index) => {
    const existing = incoming.id ? existingNodeMap.get(incoming.id) : undefined;

    if (existing && action !== "add") {
      // Update existing node
      const updated: Node = {
        ...existing,
        type: incoming.type || existing.type,
        data: {
          ...existing.data,
          label: incoming.label || existing.data?.label || incoming.type,
          description:
            incoming.description !== undefined
              ? incoming.description
              : existing.data?.description,
          provider: incoming.provider || existing.data?.provider,
          tags: incoming.tags || existing.data?.tags,
          accentColor: incoming.accentColor || existing.data?.accentColor,
          note: incoming.note || existing.data?.note,
        },
        position: incoming.position || existing.position,
        parentId:
          incoming.parentId !== undefined
            ? incoming.parentId
            : existing.parentId,
      };
      existingNodeMap.set(existing.id, updated);
    } else {
      // Create new node
      const id = incoming.id || `node-${Date.now()}-${index}`;
      const type = incoming.type || "server";
      const dim = DEFAULT_NODE_SIZES[type] || { w: 168, h: 72 };

      // Calculate position relative to viewport or offset
      const posX =
        incoming.position?.x ?? viewportCenter.x + (index % 3) * 220 - 150;
      const posY =
        incoming.position?.y ?? viewportCenter.y + Math.floor(index / 3) * 140;

      const newNode: Node = {
        id,
        type,
        position: { x: posX, y: posY },
        data: {
          label: incoming.label || type,
          category: "Core",
          description: incoming.description || "",
          tags: incoming.tags || [],
          provider: incoming.provider,
          accentColor: incoming.accentColor,
          note: incoming.note,
          fontColor: "#ffffff",
          theme: "default",
          ai: { summary: "", notes: "", lastAnalyzed: null },
        },
        style: {
          width: dim.w,
          height: dim.h,
          backgroundColor: incoming.accentColor || "#1a1a2e",
          borderColor: "#555",
          borderRadius: 8,
          opacity: 1,
          fontSize: 13,
        },
        ...(incoming.parentId
          ? { parentId: incoming.parentId, extent: "parent" as const }
          : {}),
      };

      existingNodeMap.set(id, newNode);
      addedNodes.push(newNode);
    }
  });

  workingNodes = Array.from(existingNodeMap.values());
  const validNodeIds = new Set(workingNodes.map((n) => n.id));

  // C. Process Edges
  const existingEdgeKeys = new Set(
    workingEdges.map((e) => `${e.source}->${e.target}`),
  );

  rawEdges.forEach((incoming, idx) => {
    if (
      !validNodeIds.has(incoming.source) ||
      !validNodeIds.has(incoming.target)
    ) {
      return;
    }

    const key = `${incoming.source}->${incoming.target}`;
    if (!existingEdgeKeys.has(key)) {
      existingEdgeKeys.add(key);
      const edgeId = incoming.id || `edge-${Date.now()}-${idx}`;
      workingEdges.push({
        id: edgeId,
        source: incoming.source,
        target: incoming.target,
        type: "smoothstep",
        style: {
          stroke: incoming.color || "#555",
          strokeWidth: 1.5,
          ...(incoming.dashed ? { strokeDasharray: "5,5" } : {}),
        },
        animated: incoming.animated,
        data: {
          label: incoming.label || "",
          description: "",
          ai: { notes: "" },
        },
        ...(incoming.label
          ? {
              label: incoming.label,
              labelStyle: {
                fill: "#999",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              },
              labelBgStyle: { fill: "#1A1A1A", fillOpacity: 0.9 },
              labelBgPadding: [6, 4],
              labelBgBorderRadius: 6,
            }
          : {}),
      });
    }
  });

  const addedCount = rawNodes.length;
  const deletedCount = deleteNodeIds.size;
  const edgeCount = rawEdges.length;

  const summary =
    args.explanation ||
    `Updated canvas: ${addedCount > 0 ? `+${addedCount} nodes ` : ""}${deletedCount > 0 ? `-${deletedCount} nodes ` : ""}${edgeCount > 0 ? `+${edgeCount} edges` : ""}`.trim();

  return {
    nodes: workingNodes,
    edges: workingEdges,
    summary,
    applied: true,
  };
}
