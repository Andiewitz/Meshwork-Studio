import type { Edge, Node } from "@xyflow/react";
import { getNodeSize, NODE_DEFINITIONS } from "./nodeRegistry";
import { createConnections } from "./connectionStyles";

export type DiagramContext = "all" | "architecture" | "workflow" | "data";
export type DiagramStarter = Exclude<DiagramContext, "all">;

export const DIAGRAM_CONTEXTS: { id: DiagramContext; label: string }[] = [
  { id: "all", label: "All nodes" },
  { id: "architecture", label: "Architecture" },
  { id: "workflow", label: "Workflow" },
  { id: "data", label: "Data pipeline" },
];

export const STARTER_RECOMMENDATIONS: Record<
  DiagramContext,
  readonly string[]
> = {
  all: [
    "server",
    "database",
    "gateway",
    "microservice",
    "cache",
    "loadBalancer",
  ],
  architecture: [
    "user",
    "gateway",
    "microservice",
    "database",
    "cache",
    "queue",
  ],
  workflow: [
    "user",
    "workflow-task",
    "workflow-decision",
    "workflow-event",
    "workflow-input",
    "workflow-output",
    "workflow-lane",
  ],
  data: [
    "data-source",
    "data-transform",
    "data-dataset",
    "data-model",
    "data-destination",
    "data-schedule",
  ],
};

export function canApplyDiagramStarter(
  graph: { nodes: readonly Node[]; edges: readonly Edge[] },
  state: {
    canEdit: boolean;
    conflict: boolean;
    ready: boolean;
    root: boolean;
    idle: boolean;
  },
): boolean {
  return (
    state.canEdit &&
    !state.conflict &&
    state.ready &&
    state.root &&
    state.idle &&
    graph.nodes.length === 0 &&
    graph.edges.length === 0
  );
}

const starterNodes: Record<
  DiagramStarter,
  readonly { type: string; label: string }[]
> = {
  architecture: [
    { type: "user", label: "User" },
    { type: "microservice", label: "Service" },
    { type: "database", label: "Database" },
  ],
  workflow: [
    { type: "workflow-input", label: "Request" },
    { type: "workflow-task", label: "Review" },
    { type: "workflow-decision", label: "Decision" },
    { type: "workflow-output", label: "Outcome" },
  ],
  data: [
    { type: "data-source", label: "Data source" },
    { type: "data-transform", label: "Transform" },
    { type: "data-dataset", label: "Dataset" },
    { type: "data-destination", label: "Destination" },
  ],
};

/** Build an editable graph; callers must check that the target canvas is empty. */
export function createDiagramStarter(
  kind: DiagramStarter,
  origin: { x: number; y: number },
  nextId: () => string,
  dark: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes = starterNodes[kind].map((item, index): Node => {
    const size = getNodeSize(item.type);
    const definition = NODE_DEFINITIONS.find((entry) => entry.id === item.type);
    if (!definition) throw new Error(`Unknown starter node type: ${item.type}`);
    return {
      id: nextId(),
      type: item.type,
      position: { x: origin.x + index * 250, y: origin.y },
      width: size.w,
      height: size.h,
      data: {
        label: item.label,
        category: definition.palette?.category ?? "Core",
        description: definition.description ?? "",
        tags: [],
      },
    };
  });
  let edges: Edge[] = [];
  for (let index = 0; index < nodes.length - 1; index++) {
    const result = createConnections(
      edges,
      {
        source: nodes[index].id,
        target: nodes[index + 1].id,
        sourceHandle: "right",
        targetHandle: "left-target",
      },
      "sync",
      "step",
      "solid",
      true,
      dark,
      nodes,
      nextId,
    );
    if (result.added.length !== 1)
      throw new Error("Could not connect starter nodes.");
    edges = result.edges.map((edge) => {
      const data = { ...edge.data };
      delete data.connectionKind;
      return { ...edge, data };
    });
  }
  return { nodes, edges };
}
