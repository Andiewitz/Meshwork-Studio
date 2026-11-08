import { MarkerType, type Node, type Edge } from "@xyflow/react";
import {
  getNodeSize,
  resolveNodeType,
  NODE_SIZES,
  TYPE_ALIASES,
  VALID_TYPES,
} from "@/features/workspace/utils/nodeRegistry";
import { getNodeDimensions } from "@/features/workspace/utils/nodeGeometry";
import { getAbsoluteNodePosition } from "@/features/workspace/utils/containment";

export { NODE_SIZES, TYPE_ALIASES, VALID_TYPES };

/** Shape of a raw node as returned by the AI (loosely typed) */
interface RawNode {
  id?: string;
  type?: string;
  position?: { x?: number; y?: number };
  width?: number;
  height?: number;
  parentId?: string;
  data?: Record<string, unknown> & {
    label?: string;
    category?: string;
    description?: string;
    tags?: string[];
    provider?: string;
    accentColor?: string;
    note?: string;
    ai?: { summary?: string; notes?: string; lastAnalyzed?: string | null };
  };
  style?: {
    width?: number;
    height?: number;
    backgroundColor?: string;
    borderColor?: string;
    borderRadius?: number;
    opacity?: number;
    fontColor?: string;
    fontSize?: number;
    icon?: string | null;
    theme?: string;
    strokeDasharray?: string;
    stroke?: string;
    strokeWidth?: number;
  };
}

/** Shape of a raw edge as returned by the AI (loosely typed) */
export interface RawEdge {
  id?: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  markerEnd?: unknown;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  kind?: "sync" | "async" | "primary";
  dashed?: boolean;
  animated?: boolean;
  color?: string;
  data?: {
    label?: string;
    description?: string;
    ai?: { notes?: string };
  };
  style?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  };
}

/** Render AI connections with the same visual vocabulary as the editor. */
export function createGeneratedEdge(
  e: RawEdge,
  id: string,
  sourceNode: Node,
  targetNode: Node,
  nodes: Node[],
): Edge {
  const handles = getSmartHandleIds(sourceNode, targetNode, nodes);
  const asyncTypes = new Set(["queue", "bus", "nats"]);
  const explicitKind =
    e.kind === "sync" || e.kind === "async" || e.kind === "primary"
      ? e.kind
      : undefined;
  const kind =
    explicitKind ??
    (e.dashed ||
    e.style?.strokeDasharray ||
    asyncTypes.has(sourceNode.type ?? "") ||
    asyncTypes.has(targetNode.type ?? "")
      ? "async"
      : "sync");
  const stroke =
    e.color ||
    e.style?.stroke ||
    (kind === "primary"
      ? "var(--workspace-connection-primary)"
      : "var(--workspace-connection-stroke)");
  const dash =
    e.style?.strokeDasharray ??
    (e.dashed || kind === "async" ? "8 6" : undefined);
  const label = e.label ?? e.data?.label ?? "";
  return {
    id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? handles.sourceHandle,
    targetHandle: e.targetHandle ?? handles.targetHandle,
    type: e.type ?? "step",
    style: {
      ...e.style,
      stroke,
      strokeWidth: e.style?.strokeWidth ?? (kind === "primary" ? 3 : 2),
      ...(dash ? { strokeDasharray: dash } : {}),
    },
    markerEnd:
      e.markerEnd && typeof e.markerEnd === "object"
        ? (e.markerEnd as Edge["markerEnd"])
        : { type: MarkerType.ArrowClosed, color: stroke },
    animated: e.animated ?? false,
    data: {
      ...e.data,
      label,
      description: e.data?.description ?? "",
      ai: { notes: e.data?.ai?.notes ?? "" },
      connectionKind: kind,
    },
    ...(label
      ? {
          label,
          labelStyle: {
            fill: "var(--workspace-connection-label)",
            fontSize: 11,
            fontFamily: "var(--font-body)",
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: "var(--workspace-connection-label-bg)",
            fillOpacity: 0.95,
          },
          labelBgPadding: [6, 4] as [number, number],
          labelBgBorderRadius: 6,
        }
      : {}),
  };
}

/** Route the second direction of a request/response around the first. */
export function separateGeneratedReturn(
  edge: Edge,
  existing: Edge[],
  nodes: Node[],
): Edge {
  const reverse = existing.find(
    (candidate) =>
      candidate.source === edge.target && candidate.target === edge.source,
  );
  if (!reverse) return edge;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  const sourceSide = reverse.targetHandle?.startsWith("bottom")
    ? "top"
    : "bottom";
  const targetSide = reverse.sourceHandle?.startsWith("bottom")
    ? "top"
    : "bottom";
  return {
    ...edge,
    sourceHandle: source?.type === "junction" ? null : sourceSide,
    targetHandle: target?.type === "junction" ? null : `${targetSide}-target`,
  };
}

/** Shape of the raw canvas payload from the AI */
interface RawCanvas {
  nodes: RawNode[];
  edges: RawEdge[];
}

/**
 * Calculates optimal source and target handles based on relative geometric positions
 */
export function getSmartHandleIds(
  sourceNode: Node,
  targetNode: Node,
  allNodes: Node[] = [sourceNode, targetNode],
): { sourceHandle: string; targetHandle: string } {
  const { width: sW, height: sH } = getNodeDimensions(sourceNode);
  const { width: tW, height: tH } = getNodeDimensions(targetNode);

  const sourcePosition = getAbsoluteNodePosition(sourceNode, allNodes);
  const targetPosition = getAbsoluteNodePosition(targetNode, allNodes);
  const sCenterX = sourcePosition.x + sW / 2;
  const sCenterY = sourcePosition.y + sH / 2;
  const tCenterX = targetPosition.x + tW / 2;
  const tCenterY = targetPosition.y + tH / 2;

  const dx = tCenterX - sCenterX;
  const dy = tCenterY - sCenterY;

  // Horizontal flow dominates if |dx| >= |dy|
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourceHandle: "right", targetHandle: "left-target" };
    } else {
      return { sourceHandle: "left", targetHandle: "right-target" };
    }
  } else {
    // Vertical flow dominates
    if (dy >= 0) {
      return { sourceHandle: "bottom", targetHandle: "top-target" };
    } else {
      return { sourceHandle: "top", targetHandle: "bottom-target" };
    }
  }
}

export function validateAndRepairCanvas(
  raw: unknown,
): { nodes: Node[]; edges: Edge[] } | null {
  const r = raw as RawCanvas | null | undefined;
  if (!r || !Array.isArray(r.nodes) || !Array.isArray(r.edges)) return null;

  const seenIds = new Set<string>();

  const nodes: Node[] = r.nodes.map((n, i) => {
    // Preserve unknown components through the generic renderer instead of
    // silently changing their architectural meaning to a server.
    const { type, originalType } = resolveNodeType(n.type);

    // Enforce correct size
    const dim = getNodeSize(type);
    const existingW = n.width ?? n.style?.width;
    const existingH = n.height ?? n.style?.height;
    const width =
      typeof existingW === "number" &&
      Number.isFinite(existingW) &&
      existingW >= 48
        ? Math.min(existingW, 100_000)
        : dim.w;
    const height =
      typeof existingH === "number" &&
      Number.isFinite(existingH) &&
      existingH >= 24
        ? Math.min(existingH, 100_000)
        : dim.h;

    // Deduplicate IDs
    let id = n.id ?? `node-${i}`;
    if (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);

    // Ensure position exists and is on-screen
    const x = typeof n.position?.x === "number" ? n.position.x : i * 220 + 100;
    const y = typeof n.position?.y === "number" ? n.position.y : 100;
    const style = { ...n.style };
    delete style.width;
    delete style.height;

    return {
      id,
      type,
      position: { x, y },
      width,
      height,
      data: {
        ...n.data,
        label: n.data?.label ?? type,
        category: n.data?.category ?? "Core",
        description: n.data?.description ?? "",
        tags: n.data?.tags ?? [],
        ...((n.data?.fontColor ?? n.style?.fontColor)
          ? { fontColor: n.data?.fontColor ?? n.style?.fontColor }
          : {}),
        icon:
          (n.data?.icon as string | null | undefined) ?? n.style?.icon ?? null,
        theme:
          (n.data?.theme as string | undefined) ?? n.style?.theme ?? "default",
        ai: {
          summary: n.data?.ai?.summary ?? "",
          notes: n.data?.ai?.notes ?? "",
          lastAnalyzed: n.data?.ai?.lastAnalyzed ?? null,
        },
        ...(originalType ? { originalType } : {}),
        ...(n.data?.provider ? { provider: n.data.provider } : {}),
        ...(n.data?.accentColor ? { accentColor: n.data.accentColor } : {}),
        ...(n.data?.note ? { note: n.data.note } : {}),
      },
      ...(Object.keys(style).length ? { style } : {}),
      ...(n.parentId
        ? { parentId: n.parentId, extent: "parent" as const }
        : {}),
    };
  });

  const nodeMap = new Map<string, Node>(nodes.map((n) => [n.id, n]));

  const edges: Edge[] = r.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e, i) => {
      const sourceNode = nodeMap.get(e.source)!;
      const targetNode = nodeMap.get(e.target)!;
      return createGeneratedEdge(
        e,
        e.id ?? `edge-${i}`,
        sourceNode,
        targetNode,
        nodes,
      );
    });

  return { nodes, edges };
}
