import type { Edge, Node } from "@xyflow/react";
import { secureFetch } from "@/lib/secure-fetch";
import {
  architecturePlanSchema,
  type ArchitecturePlan,
} from "@shared/architecture-plan";
import { formatCanvasContext } from "./jenkosAgent";
import {
  CONTAINER_TYPES,
  resolveNodeType,
} from "@/features/workspace/utils/nodeRegistry";

export function canvasFingerprint(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({
    nodes: nodes
      .map(({ id, type, position, parentId, data, style, width, height }) => ({
        id,
        type,
        position,
        parentId,
        data,
        style,
        width,
        height,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges
      .map(
        ({
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
          type,
          label,
          data,
          style,
          markerEnd,
        }) => ({
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
          type,
          label,
          data,
          style,
          markerEnd,
        }),
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function validatePlanGraph(plan: ArchitecturePlan, nodes: Node[]): void {
  const existing = new Map(nodes.map((node) => [node.id, node]));
  const proposed = new Map(
    plan.components.map((component) => [component.id, component]),
  );
  for (const component of plan.components) {
    if (existing.has(component.id))
      throw new Error(
        `Component ID ${component.id} already exists on the canvas.`,
      );
    if (component.parentId) {
      const parent =
        proposed.get(component.parentId) || existing.get(component.parentId);
      if (
        !parent ||
        !CONTAINER_TYPES.has(resolveNodeType(parent.type || "").type)
      )
        throw new Error(`Invalid container for ${component.label}.`);
      const visited = new Set([component.id]);
      let next: string | undefined = component.parentId;
      while (next && proposed.has(next)) {
        if (visited.has(next))
          throw new Error("The proposed groups contain a cycle.");
        visited.add(next);
        next = proposed.get(next)?.parentId;
      }
    }
  }
  for (const edge of plan.connections) {
    if (
      edge.source === edge.target ||
      !(existing.has(edge.source) || proposed.has(edge.source)) ||
      !(existing.has(edge.target) || proposed.has(edge.target))
    )
      throw new Error("A proposed connection has an invalid endpoint.");
  }
}

const text = { type: "string" };
const planTool = {
  type: "function",
  function: {
    name: "propose_architecture",
    description:
      "Propose a reviewable architecture without changing the canvas.",
    parameters: {
      type: "object",
      properties: {
        title: text,
        summary: text,
        assumptions: { type: "array", items: text },
        risks: { type: "array", items: text },
        components: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: text,
              type: text,
              label: text,
              description: text,
              parentId: text,
            },
            required: ["id", "type", "label"],
          },
        },
        connections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: text,
              target: text,
              label: text,
              kind: { type: "string", enum: ["sync", "async", "primary"] },
            },
            required: ["source", "target"],
          },
        },
      },
      required: [
        "title",
        "summary",
        "assumptions",
        "components",
        "connections",
        "risks",
      ],
    },
  },
};

export async function generateArchitecturePlan(
  prompt: string,
  model: string,
  nodes: Node[],
  edges: Edge[],
): Promise<ArchitecturePlan> {
  const response = await secureFetch("/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      provider: "gemini",
      model,
      stream: false,
      tools: [planTool],
      messages: [
        {
          role: "system",
          content: `You are an architecture planner. Use propose_architecture to propose at most 20 new components and 40 directed connections. Do not mutate the canvas. Give concrete assumptions, risks and cost-conscious tradeoffs. Only include necessary components. Use supported types: server, microservice, logic, worker, database, storage, cache, search, gateway, loadBalancer, cdn, route53, waf, queue, bus, vpc, region, k8s-namespace, k8s-pod, k8s-deployment, k8s-service, user, app, annotation, note. Give each new component a unique id. Connection endpoints must use IDs of existing or proposed components. Use parentId only for a container. ${formatCanvasContext(nodes, edges, { x: 0, y: 0 })}`,
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `AI request failed (${response.status}).`);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const call = message?.tool_calls?.find(
    (candidate: any) => candidate.function?.name === "propose_architecture",
  );
  if (!call)
    throw new Error(
      message?.content ||
        "The AI did not return a structured plan. Please try again.",
    );
  let raw: unknown;
  try {
    raw = JSON.parse(call.function.arguments);
  } catch {
    throw new Error("The AI returned an unreadable plan. Please try again.");
  }
  const result = architecturePlanSchema.safeParse(raw);
  if (!result.success)
    throw new Error("The AI returned an incomplete plan. Please try again.");
  validatePlanGraph(result.data, nodes);
  return result.data;
}
