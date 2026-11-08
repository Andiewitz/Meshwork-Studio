import {
  addEdge,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { EdgeStyle, EdgeType } from "./canvasSettings";

export type ConnectionPreset =
  "sync" | "async" | "primary" | "request-response";
export const CONNECTION_PRESETS: {
  id: ConnectionPreset;
  label: string;
  description: string;
}[] = [
  {
    id: "sync",
    label: "Sync call",
    description: "A solid arrow for a call that waits for a reply.",
  },
  {
    id: "async",
    label: "Async event",
    description: "A dashed arrow for an event or message.",
  },
  {
    id: "primary",
    label: "Primary path",
    description: "A highlighted arrow for the main flow.",
  },
  {
    id: "request-response",
    label: "Request + response",
    description: "Create two separately editable arrows.",
  },
];

export function dashForStyle(style: EdgeStyle): string | undefined {
  return style === "dashed" ? "8 6" : style === "dotted" ? "2 5" : undefined;
}

export function presetAppearance(preset: ConnectionPreset, dark: boolean) {
  const color =
    preset === "primary"
      ? dark
        ? "#75b2ff"
        : "#1455b8"
      : dark
        ? "#a8b6c8"
        : "#46566a";
  return {
    color,
    dash: preset === "async" ? "8 6" : undefined,
    width: preset === "primary" ? 3 : 2,
  };
}

export function applyConnectionPreset(
  edge: Edge,
  preset: Exclude<ConnectionPreset, "request-response">,
  dark: boolean,
): Edge {
  const { color, dash, width } = presetAppearance(preset, dark);
  return {
    ...edge,
    style: {
      ...edge.style,
      stroke: color,
      strokeWidth: width,
      strokeDasharray: dash,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color },
    data: { ...edge.data, connectionKind: preset },
  };
}

/** Add both request and response or neither; each is an ordinary editable edge. */
export function createConnections(
  existing: Edge[],
  params: Connection,
  preset: ConnectionPreset,
  edgeType: EdgeType,
  edgeStyle: EdgeStyle,
  hasArrow: boolean,
  dark: boolean,
  nodes: Node[],
  nextId: () => string,
): { edges: Edge[]; added: Edge[] } {
  const pair = preset === "request-response";
  const appearance = presetAppearance(preset, dark);
  const makeEdge = (connection: Connection, label: string): Edge => ({
    ...connection,
    id: nextId(),
    type: edgeType,
    style: {
      stroke: appearance.color,
      strokeWidth: appearance.width,
      strokeDasharray: dashForStyle(edgeStyle),
    },
    markerEnd: hasArrow
      ? { type: MarkerType.ArrowClosed, color: appearance.color }
      : undefined,
    ...(label ? { label } : {}),
    data: { label, description: "", connectionKind: pair ? label : preset },
  });
  const added = [makeEdge(params, pair ? "request" : "")];
  if (pair) {
    const sourceNode = nodes.find((node) => node.id === params.target);
    const targetNode = nodes.find((node) => node.id === params.source);
    // Use the opposite vertical side for the return path so the two arrows don't overlap.
    const sourceSide = params.targetHandle?.startsWith("bottom")
      ? "top"
      : "bottom";
    const targetSide = params.sourceHandle?.startsWith("bottom")
      ? "top"
      : "bottom";
    added.push(
      makeEdge(
        {
          source: params.target,
          target: params.source,
          sourceHandle: sourceNode?.type === "junction" ? null : sourceSide,
          targetHandle:
            targetNode?.type === "junction" ? null : `${targetSide}-target`,
        },
        "response",
      ),
    );
  }
  let result = existing;
  for (const edge of added) result = addEdge(edge, result);
  if (result.length !== existing.length + added.length)
    return { edges: existing, added: [] };
  return { edges: result, added };
}
