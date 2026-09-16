import type { Node, Edge } from "@xyflow/react";
import {
  validateAndRepairCanvas,
  getSmartHandleIds,
  TYPE_ALIASES,
} from "@/lib/ai-canvas-utils";
import {
  getNodeSize,
  resolveNodeType,
  CONTAINER_TYPES,
} from "@/features/workspace/utils/nodeRegistry";
import {
  getNodeDimensions,
  withNodeDimensions,
} from "@/features/workspace/utils/nodeGeometry";
import { expandNodeSubtreeIds } from "@/features/workspace/utils/containment";

export interface EditCanvasNodeInput {
  id?: string;
  type: string;
  label?: string;
  description?: string;
  position?: { x: number; y: number };
  parentId?: string;
  width?: number;
  height?: number;
  accentColor?: string;
  tags?: string[];
  provider?: string;
  note?: string;
  /** Used only by the legacy React Flow JSON adapter. */
  data?: Record<string, unknown>;
  /** Used only by the legacy React Flow JSON adapter. */
  style?: Record<string, unknown>;
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

function uniqueNodeId(id: string, usedIds: Set<string>): string {
  let suffix = 2;
  let candidate = `${id}-ai-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${id}-ai-${suffix}`;
  }
  return candidate;
}

function requestedDimension(value: unknown, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(24, Math.round(value))
    : minimum;
}

/**
 * AI positions are canvas-relative by default. Once a child is attached to a
 * container it must be parent-local; lay automatic children out vertically
 * below the container header and grow the container only when needed.
 */
function arrangeAutomaticChildren(
  nodes: Node[],
  automaticChildIds: Set<string>,
): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, Node[]>();

  for (const node of nodes) {
    if (!node.parentId || !automaticChildIds.has(node.id)) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  for (const [parentId, children] of childrenByParent) {
    const parent = byId.get(parentId);
    if (!parent || !CONTAINER_TYPES.has(parent.type ?? "")) continue;

    const existingChildren = nodes.filter(
      (node) => node.parentId === parentId && !automaticChildIds.has(node.id),
    );
    let nextY = 48;
    for (const child of existingChildren) {
      const { height } = getNodeDimensions(child);
      nextY = Math.max(nextY, child.position.y + height + 24);
    }

    let requiredWidth = 0;
    for (const child of children) {
      const { width, height } = getNodeDimensions(child);
      const positioned = {
        ...child,
        position: { x: 24, y: nextY },
        extent: "parent" as const,
      };
      byId.set(child.id, positioned);
      nextY += height + 24;
      requiredWidth = Math.max(requiredWidth, width + 48);
    }

    const parentSize = getNodeDimensions(parent);
    byId.set(
      parentId,
      withNodeDimensions(parent, {
        width: Math.max(parentSize.width, requiredWidth),
        height: Math.max(parentSize.height, nextY),
      }),
    );
  }

  return nodes.map((node) => byId.get(node.id) ?? node);
}

/**
 * Categorizes a node type into a horizontal pipeline tier (0: Entry -> 1: Routing -> 2: Compute -> 3: Data/Queues)
 */
function getNodeTier(type: string): number {
  const normalized = TYPE_ALIASES[type.toLowerCase()] || type.toLowerCase();
  switch (normalized) {
    case "user":
    case "app":
    case "route53":
    case "cdn":
    case "waf":
      return 0; // Entry tier

    case "gateway":
    case "loadbalancer":
    case "ingress":
    case "k8s-ingress":
      return 1; // Gateway & Traffic tier

    case "microservice":
    case "server":
    case "worker":
    case "logic":
    case "k8s-pod":
    case "k8s-deployment":
    case "k8s-service":
    case "auth0":
    case "vault":
    case "stripe":
    case "twilio":
      return 2; // Compute & Application tier

    case "database":
    case "cache":
    case "storage":
    case "search":
    case "queue":
    case "bus":
    case "influxdb":
    case "snowflake":
    case "clickhouse":
    case "nats":
    case "socketio":
    case "prometheus":
    case "grafana":
    case "datadog":
      return 3; // Persistence & Async tier

    default:
      return 2;
  }
}

/**
 * Calculates tiered positions for a collection of nodes to eliminate overlapping boxes
 */
function computeTieredLayout(
  nodes: EditCanvasNodeInput[],
  origin: { x: number; y: number },
): Map<number, { x: number; y: number }> {
  const tierBuckets = new Map<number, number[]>([
    [0, []],
    [1, []],
    [2, []],
    [3, []],
  ]);

  nodes.forEach((n, idx) => {
    const tier = getNodeTier(n.type);
    tierBuckets.get(tier)!.push(idx);
  });

  const positions = new Map<number, { x: number; y: number }>();
  const TIER_X_OFFSET = [0, 280, 580, 880]; // generous horizontal lane separation
  const VERTICAL_GAP = 36;

  tierBuckets.forEach((nodeIndices, tier) => {
    if (nodeIndices.length === 0) return;

    // Calculate total height of this tier column
    const heights = nodeIndices.map((idx) => {
      const type =
        TYPE_ALIASES[nodes[idx].type?.toLowerCase()] ||
        nodes[idx].type ||
        "server";
      return getNodeSize(type).h;
    });

    const totalColumnHeight =
      heights.reduce((sum, h) => sum + h, 0) +
      (nodeIndices.length - 1) * VERTICAL_GAP;

    let currentY = origin.y - totalColumnHeight / 2;
    const tierX = origin.x + TIER_X_OFFSET[tier] - 380; // center around origin

    nodeIndices.forEach((nodeIdx, i) => {
      positions.set(nodeIdx, {
        x: tierX,
        y: Math.round(currentY),
      });
      currentY += heights[i] + VERTICAL_GAP;
    });
  });

  return positions;
}

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
  const deleteNodeIds = expandNodeSubtreeIds(
    currentNodes,
    args.deleteNodeIds || [],
  );
  const deleteEdgeIds = new Set(args.deleteEdgeIds || []);

  // 1. Full Replacement Action
  if (action === "replace_all") {
    const layoutPositions = computeTieredLayout(rawNodes, viewportCenter);

    const rawPayload = {
      nodes: rawNodes.map((n, idx) => ({
        id: n.id || `node-${idx + 1}`,
        type: TYPE_ALIASES[n.type?.toLowerCase()] || n.type,
        position: n.position ||
          layoutPositions.get(idx) || {
            x: viewportCenter.x + (idx % 3) * 260 - 260,
            y: viewportCenter.y + Math.floor(idx / 3) * 160 - 80,
          },
        data: {
          ...n.data,
          label: n.label || n.data?.label || n.type,
          description: n.description ?? n.data?.description ?? "",
          provider: n.provider ?? n.data?.provider,
          tags: n.tags || n.data?.tags || [],
          accentColor: n.accentColor ?? n.data?.accentColor,
          note: n.note ?? n.data?.note,
        },
        style: n.style,
        width: n.width,
        height: n.height,
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

    const automaticChildIds = new Set(
      rawNodes
        .filter((node) => node.parentId && !node.position)
        .map((node, index) => node.id || `node-${index + 1}`),
    );
    const nodes = arrangeAutomaticChildren(repaired.nodes, automaticChildIds);

    return {
      nodes,
      edges: repaired.edges,
      summary:
        args.explanation ||
        `Created new architecture with ${nodes.length} nodes and ${repaired.edges.length} edges.`,
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
  const idRemap = new Map<string, string>();
  const automaticChildIds = new Set<string>();
  const usedIds = new Set(existingNodeMap.keys());

  // `add` must never silently turn into an overwrite. Preserve the existing
  // node and remap references in this AI operation to a deterministic new ID.
  if (action === "add") {
    for (const incoming of rawNodes) {
      if (!incoming.id || !usedIds.has(incoming.id)) {
        if (incoming.id) usedIds.add(incoming.id);
        continue;
      }

      const remappedId = uniqueNodeId(incoming.id, usedIds);
      idRemap.set(incoming.id, remappedId);
      usedIds.add(remappedId);
    }
  }

  // Calculate placement baseline for newly added nodes avoiding collision
  const maxX = workingNodes.reduce(
    (max, n) => Math.max(max, n.position.x + getNodeDimensions(n).width),
    viewportCenter.x - 200,
  );

  rawNodes.forEach((incoming, index) => {
    const id = incoming.id
      ? (idRemap.get(incoming.id) ?? incoming.id)
      : undefined;
    const existing = id ? existingNodeMap.get(id) : undefined;
    const resolved = resolveNodeType(incoming.type);
    const resolvedType = resolved.type;

    if (existing && action !== "add") {
      // Update existing node
      const updated: Node = {
        ...existing,
        type: resolvedType || existing.type,
        data: {
          ...existing.data,
          label: incoming.label || existing.data?.label || resolvedType,
          description:
            incoming.description !== undefined
              ? incoming.description
              : existing.data?.description,
          provider: incoming.provider || existing.data?.provider,
          tags: incoming.tags || existing.data?.tags,
          accentColor: incoming.accentColor || existing.data?.accentColor,
          note: incoming.note || existing.data?.note,
          ...(resolved.originalType
            ? { originalType: resolved.originalType }
            : { originalType: existing.data?.originalType }),
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
      const newId = id || `node-${Date.now()}-${index}`;
      const { type, originalType } = resolved;
      const dim = getNodeSize(type);

      // Calculate position relative to viewport or offset to the right of existing canvas
      const isAutomaticChild = !incoming.position && Boolean(incoming.parentId);
      const posX = incoming.position?.x ?? maxX + 60;
      const posY =
        incoming.position?.y ?? viewportCenter.y + index * (dim.h + 30) - 50;

      const newNode: Node = {
        id: newId,
        type,
        position: { x: posX, y: posY },
        width: requestedDimension(incoming.width, dim.w),
        height: requestedDimension(incoming.height, dim.h),
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
          ...(originalType ? { originalType } : {}),
        },
        style: {
          backgroundColor: incoming.accentColor || "#1a1a2e",
          borderColor: "#555",
          borderRadius: 8,
          opacity: 1,
          fontSize: 13,
        },
        ...(incoming.parentId
          ? {
              parentId: idRemap.get(incoming.parentId) ?? incoming.parentId,
              extent: "parent" as const,
            }
          : {}),
      };

      existingNodeMap.set(newId, newNode);
      if (isAutomaticChild) automaticChildIds.add(newId);
    }
  });

  workingNodes = arrangeAutomaticChildren(
    Array.from(existingNodeMap.values()),
    automaticChildIds,
  );
  for (const node of workingNodes) existingNodeMap.set(node.id, node);
  const validNodeIds = new Set(workingNodes.map((n) => n.id));

  // C. Process Edges
  const existingEdgeKeys = new Set(
    workingEdges.map((e) => `${e.source}->${e.target}`),
  );

  rawEdges.forEach((incoming, idx) => {
    const source = idRemap.get(incoming.source) ?? incoming.source;
    const target = idRemap.get(incoming.target) ?? incoming.target;
    if (!validNodeIds.has(source) || !validNodeIds.has(target)) {
      return;
    }

    const key = `${source}->${target}`;
    if (!existingEdgeKeys.has(key)) {
      existingEdgeKeys.add(key);
      const edgeId = incoming.id || `edge-${Date.now()}-${idx}`;
      const sNode = existingNodeMap.get(source);
      const tNode = existingNodeMap.get(target);
      const handles =
        sNode && tNode
          ? getSmartHandleIds(
              sNode,
              tNode,
              Array.from(existingNodeMap.values()),
            )
          : { sourceHandle: undefined, targetHandle: undefined };

      workingEdges.push({
        id: edgeId,
        source,
        target,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
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
