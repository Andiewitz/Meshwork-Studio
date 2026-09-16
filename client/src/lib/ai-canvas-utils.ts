import type { Node, Edge } from "@xyflow/react";
import {
  getNodeSize,
  resolveNodeType,
  NODE_SIZES,
  TYPE_ALIASES,
  VALID_TYPES,
} from "@/features/workspace/utils/nodeRegistry";
import { getNodeDimensions } from "@/features/workspace/utils/nodeGeometry";

export { NODE_SIZES, TYPE_ALIASES, VALID_TYPES };

/** Shape of a raw node as returned by the AI (loosely typed) */
interface RawNode {
  id?: string;
  type?: string;
  position?: { x?: number; y?: number };
  width?: number;
  height?: number;
  parentId?: string;
  data?: {
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
interface RawEdge {
  id?: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  markerEnd?: unknown;
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
): { sourceHandle: string; targetHandle: string } {
  const { width: sW, height: sH } = getNodeDimensions(sourceNode);
  const { width: tW, height: tH } = getNodeDimensions(targetNode);

  const sCenterX = sourceNode.position.x + sW / 2;
  const sCenterY = sourceNode.position.y + sH / 2;
  const tCenterX = targetNode.position.x + tW / 2;
  const tCenterY = targetNode.position.y + tH / 2;

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
      typeof existingW === "number" && existingW >= 48 ? existingW : dim.w;
    const height =
      typeof existingH === "number" && existingH >= 24 ? existingH : dim.h;

    // Deduplicate IDs
    let id = n.id ?? `node-${i}`;
    if (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);

    // Ensure position exists and is on-screen
    const x = typeof n.position?.x === "number" ? n.position.x : i * 220 + 100;
    const y = typeof n.position?.y === "number" ? n.position.y : 100;

    return {
      id,
      type,
      position: { x, y },
      width,
      height,
      data: {
        label: n.data?.label ?? type,
        category: n.data?.category ?? "Core",
        description: n.data?.description ?? "",
        tags: n.data?.tags ?? [],
        fontColor: n.style?.fontColor ?? "#ffffff",
        icon: n.style?.icon ?? null,
        theme: n.style?.theme ?? "default",
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
      style: {
        backgroundColor:
          n.style?.backgroundColor ?? n.data?.accentColor ?? "#1a1a2e",
        borderColor: n.style?.borderColor ?? "#555",
        borderRadius: n.style?.borderRadius ?? 8,
        opacity: n.style?.opacity ?? 1,
        fontSize: n.style?.fontSize ?? 13,
      },
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
      const { sourceHandle, targetHandle } = getSmartHandleIds(
        sourceNode,
        targetNode,
      );
      const hasDash = e.style?.strokeDasharray;
      const hasArrow = e.markerEnd != null;

      return {
        id: e.id ?? `edge-${i}`,
        source: e.source,
        target: e.target,
        sourceHandle,
        targetHandle,
        type: e.type ?? "smoothstep",
        style: {
          stroke: e.style?.stroke ?? "#555",
          strokeWidth: e.style?.strokeWidth ?? 1.5,
          ...(hasDash ? { strokeDasharray: e.style!.strokeDasharray } : {}),
        },
        data: {
          label: e.data?.label ?? e.label ?? "",
          description: e.data?.description ?? "",
          ai: {
            notes: e.data?.ai?.notes ?? "",
          },
        },
        ...(hasArrow
          ? {
              markerEnd: {
                type: "arrowclosed",
                color: e.style?.stroke ?? "#555",
              },
            }
          : {}),
        ...(e.label
          ? {
              label: e.label,
              labelStyle: {
                fill: "#999",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              },
              labelBgStyle: { fill: "#1A1A1A", fillOpacity: 0.9 },
              labelBgPadding: [6, 4] as [number, number],
              labelBgBorderRadius: 6,
            }
          : {}),
      };
    });

  return { nodes, edges };
}
