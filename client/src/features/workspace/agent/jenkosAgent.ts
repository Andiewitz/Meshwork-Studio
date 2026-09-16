import type { Node, Edge } from "@xyflow/react";
import { secureFetch } from "@/lib/secure-fetch";
import {
  executeEditCanvas,
  EditCanvasToolArgs,
  CanvasExecutionResult,
} from "./tools/canvasToolExecutor";

export interface JenkosAgentMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: {
    id: string;
    name: string;
    args: EditCanvasToolArgs;
    result?: CanvasExecutionResult;
  }[];
  appliedToCanvas?: boolean;
}

export const JENKOS_SYSTEM_PROMPT = `You are Jenkos, the expert cloud systems architect, engineering co-pilot, and persistent intelligence layer for Meshwork Studio.

Your mission is to help software engineers, DevOps teams, and architects design resilient, secure, scalable, and cost-effective distributed systems.

### CORE CAPABILITIES & BEHAVIORS:
1. **Architectural Discussions**:
   - Talk naturally about distributed systems, microservices vs monoliths, caching strategies (Redis, Memcached), event-driven architectures (Kafka, RabbitMQ, SQS), databases (PostgreSQL, DynamoDB, MongoDB, Cassandra), networking, and Kubernetes.
   - If the user asks a conceptual question, tradeoff comparison, or architectural advice, give a sharp, well-reasoned answer directly in chat without invoking tools unnecessarily.

2. **Canvas Editing via \`edit_canvas\` Tool**:
   - When the user asks to design, add, connect, build, modify, or remove components from the canvas, invoke the \`edit_canvas\` tool.
   - **Incremental by default**: When asked to add or change something, add/update only the required nodes and connect them to existing nodes. Do not wipe out existing nodes unless the user explicitly requests to "start over", "clear and rebuild", or "replace everything".
   - **Supported Node Types**:
     - Compute: server, microservice, logic (Lambda/Serverless), worker
     - Storage & DBs: database (SQL/NoSQL), storage (S3/Blob), cache (Redis), search (Elasticsearch)
     - Networking & Edge: gateway (API Gateway), loadBalancer, cdn, route53, waf
     - Messaging: queue (RabbitMQ/SQS), bus (Kafka/Kinesis)
     - Infrastructure & Containers: vpc, region, k8s-namespace, k8s-pod, k8s-deployment, k8s-service
     - Client/UI: user, app (Frontend/Mobile)
     - Documentation: annotation, note

3. **Topology & Multi-Node Connections (CRITICAL)**:
   - **Comprehensive Fan-Outs & Fan-Ins**: In modern architectures, components rarely connect 1-to-1 in isolation.
     - When designing a system, connect the ingress layer (e.g., API Gateway or Load Balancer) to **ALL** relevant downstream services.
     - Connect services to **BOTH** their respective databases, cache layers (e.g. Redis), and messaging buses (e.g. Kafka/RabbitMQ).
     - Connect async workers to the queues they consume from and the storage/databases they write to.
   - **Avoid Dangling Nodes**: Every component you create should have at least one meaningful inbound or outbound edge representing network traffic, data flow, or async events.
   - **Descriptive Protocols on Edges**: Always provide protocol/data labels on edges (e.g., "HTTPS / REST", "gRPC", "TCP", "SQL Query", "Pub/Sub Events", "Cache Lookup", "S3 Upload").
   - Group private resources inside VPCs or Kubernetes namespaces by specifying their \`parentId\`.
`;

export const JENKOS_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "edit_canvas",
      description:
        "Create, update, connect, or delete components on the visual architecture canvas.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "update", "delete", "replace_all", "reorganize"],
            description: "The mutation action to perform on the canvas.",
          },
          explanation: {
            type: "string",
            description:
              "A concise summary of what changes are being made and the architectural rationale.",
          },
          nodes: {
            type: "array",
            description: "List of nodes to add or update.",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description:
                    "Node ID (optional for new nodes, required for updating existing)",
                },
                type: {
                  type: "string",
                  description:
                    "Node type (e.g., database, microservice, cache, queue, gateway, loadBalancer, storage, vpc, k8s-deployment)",
                },
                label: { type: "string", description: "Component label" },
                description: {
                  type: "string",
                  description: "Brief role description",
                },
                provider: {
                  type: "string",
                  description: "Cloud provider: aws, gcp, azure, k8s, etc.",
                },
                parentId: {
                  type: "string",
                  description: "Optional parent container ID (e.g. VPC ID)",
                },
                width: {
                  type: "number",
                  description:
                    "Optional node width in canvas units; use for containers that need a deliberate size.",
                },
                height: {
                  type: "number",
                  description:
                    "Optional node height in canvas units; use for containers that need a deliberate size.",
                },
                accentColor: { type: "string", description: "Hex color code" },
                position: {
                  type: "object",
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                },
              },
              required: ["type", "label"],
            },
          },
          edges: {
            type: "array",
            description: "List of directional connection edges to add.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                source: { type: "string", description: "Source node ID" },
                target: { type: "string", description: "Target node ID" },
                label: {
                  type: "string",
                  description:
                    "Connection protocol or description (e.g. HTTPS, gRPC)",
                },
                dashed: { type: "boolean" },
                animated: { type: "boolean" },
              },
              required: ["source", "target"],
            },
          },
          deleteNodeIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of node IDs to remove from the canvas",
          },
          deleteEdgeIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of edge IDs to remove from the canvas",
          },
        },
        required: ["explanation"],
      },
    },
  },
];

/**
 * Serializes persistent memories and architectural context
 */
export function formatMemoriesContext(
  memories?: { key: string; content: string; category?: string }[],
): string {
  if (!memories || memories.length === 0) return "";
  return (
    `\n\nRELEVANT MEMORIES & PERSISTENT CONTEXT:\n` +
    memories
      .map((m) => `- [${m.category || "fact"}] ${m.key}: ${m.content}`)
      .join("\n")
  );
}

/**
 * Serializes current canvas state into structured JSON context for Jenkos
 */
export function formatCanvasContext(
  nodes: Node[],
  edges: Edge[],
  viewportCenter: { x: number; y: number },
  memories?: { key: string; content: string; category?: string }[],
): string {
  const memoryText = formatMemoriesContext(memories);

  if (nodes.length === 0) {
    return `${memoryText}\n\nCURRENT CANVAS STATE: Empty canvas.\nVIEWPORT CENTER: x=${viewportCenter.x}, y=${viewportCenter.y}.`;
  }

  const simplifiedNodes = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    label: (n.data?.label as string) || n.type,
    description: (n.data?.description as string) || "",
    provider: (n.data?.provider as string) || undefined,
    parentId: n.parentId || undefined,
    position: n.position,
  }));

  const simplifiedEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.data?.label as string) || (e.label as string) || undefined,
  }));

  return `${memoryText}\n\nCURRENT CANVAS STATE (${nodes.length} nodes, ${edges.length} edges):
\`\`\`json
${JSON.stringify({ nodes: simplifiedNodes, edges: simplifiedEdges }, null, 2)}
\`\`\`
VIEWPORT CENTER: x=${viewportCenter.x}, y=${viewportCenter.y}.`;
}

export interface SendAgentPromptOptions {
  userPrompt: string;
  history: JenkosAgentMessage[];
  currentNodes: Node[];
  currentEdges: Edge[];
  viewportCenter: { x: number; y: number };
  memories?: { key: string; content: string; category?: string }[];
  model?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface AgentRunResponse {
  message: JenkosAgentMessage;
  canvasResult?: CanvasExecutionResult;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Adapts legacy React Flow JSON into the flat AI tool contract without loss. */
function adaptLegacyCanvasNodes(value: unknown): EditCanvasToolArgs["nodes"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const node = asRecord(candidate);
    if (!node || typeof node.type !== "string") return [];
    const data = asRecord(node.data);
    const style = asRecord(node.style);
    const position = asRecord(node.position);
    return [
      {
        id: typeof node.id === "string" ? node.id : undefined,
        type: node.type,
        label:
          (typeof data?.label === "string" && data.label) ||
          (typeof node.label === "string" ? node.label : undefined),
        description:
          typeof data?.description === "string" ? data.description : undefined,
        parentId: typeof node.parentId === "string" ? node.parentId : undefined,
        position:
          typeof position?.x === "number" && typeof position.y === "number"
            ? { x: position.x, y: position.y }
            : undefined,
        width:
          typeof node.width === "number"
            ? node.width
            : typeof style?.width === "number"
              ? style.width
              : undefined,
        height:
          typeof node.height === "number"
            ? node.height
            : typeof style?.height === "number"
              ? style.height
              : undefined,
        provider:
          typeof data?.provider === "string" ? data.provider : undefined,
        accentColor:
          typeof data?.accentColor === "string" ? data.accentColor : undefined,
        note: typeof data?.note === "string" ? data.note : undefined,
        tags: Array.isArray(data?.tags)
          ? data.tags.filter((tag): tag is string => typeof tag === "string")
          : undefined,
        data,
        style,
      },
    ];
  });
}

function adaptLegacyCanvasEdges(value: unknown): EditCanvasToolArgs["edges"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const edge = asRecord(candidate);
    if (
      !edge ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string"
    ) {
      return [];
    }
    const data = asRecord(edge.data);
    const style = asRecord(edge.style);
    return [
      {
        id: typeof edge.id === "string" ? edge.id : undefined,
        source: edge.source,
        target: edge.target,
        label:
          (typeof data?.label === "string" && data.label) ||
          (typeof edge.label === "string" ? edge.label : undefined),
        dashed: typeof style?.strokeDasharray === "string",
        animated:
          typeof edge.animated === "boolean" ? edge.animated : undefined,
        color: typeof style?.stroke === "string" ? style.stroke : undefined,
      },
    ];
  });
}

/**
 * Runs the Jenkos Agent loop against the AI Service
 */
export async function runJenkosAgent({
  userPrompt,
  history,
  currentNodes,
  currentEdges,
  viewportCenter,
  memories,
  model = "gemini-3.5-flash",
  onStatusUpdate,
}: SendAgentPromptOptions): Promise<AgentRunResponse> {
  onStatusUpdate?.("Consulting Jenkos...");

  const canvasContext = formatCanvasContext(
    currentNodes,
    currentEdges,
    viewportCenter,
    memories,
  );
  const fullSystemPrompt = JENKOS_SYSTEM_PROMPT + canvasContext;

  const payloadMessages = [
    { role: "system" as const, content: fullSystemPrompt },
    ...history
      .filter((m) => m.id !== "init")
      .map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        })),
      })),
    { role: "user" as const, content: userPrompt },
  ];

  const response = await secureFetch("/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      provider: "gemini",
      model,
      messages: payloadMessages,
      tools: JENKOS_TOOLS,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new Error(
      errBody.error || errBody.message || `API error ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: {
          id: string;
          type: string;
          function: {
            name: string;
            arguments: string;
          };
        }[];
      };
    }[];
  };

  const choice = data.choices?.[0]?.message;
  if (!choice) {
    throw new Error("No response returned by AI service.");
  }

  let textContent = choice.content || "";
  const toolCalls = choice.tool_calls || [];
  let canvasResult: CanvasExecutionResult | undefined;
  const executedToolCalls: JenkosAgentMessage["toolCalls"] = [];

  if (toolCalls.length > 0) {
    onStatusUpdate?.("Applying architecture modifications...");
    let workingNodes = currentNodes;
    let workingEdges = currentEdges;
    for (const tc of toolCalls) {
      if (tc.function.name === "edit_canvas") {
        let args: EditCanvasToolArgs = {};
        try {
          args =
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
        } catch {
          args = {};
        }

        const result = executeEditCanvas(
          workingNodes,
          workingEdges,
          args,
          viewportCenter,
        );
        if (result.applied) {
          workingNodes = result.nodes;
          workingEdges = result.edges;
        }
        canvasResult = result;
        executedToolCalls.push({
          id: tc.id,
          name: tc.function.name,
          args,
          result,
        });

        if (!textContent && args.explanation) {
          textContent = args.explanation;
        }
      }
    }
  }

  // Fallback: If model returned markdown ```json instead of tool call, parse legacy block
  if (!canvasResult && /```(?:json)?\n[\s\S]*?\n```/.test(textContent)) {
    const jsonMatch = /```(?:json)?\n([\s\S]*?)\n```/.exec(textContent);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.nodes || parsed.edges) {
          canvasResult = executeEditCanvas(
            currentNodes,
            currentEdges,
            {
              action: "replace_all",
              nodes: adaptLegacyCanvasNodes(parsed.nodes),
              edges: adaptLegacyCanvasEdges(parsed.edges),
              explanation: "Generated full architecture diagram.",
            },
            viewportCenter,
          );
          textContent = textContent
            .replace(/```(?:json)?\n[\s\S]*?\n```/g, "")
            .trim();
        }
      } catch {
        // Ignore fallback parse failure
      }
    }
  }

  const assistantMessage: JenkosAgentMessage = {
    id: (Date.now() + 1).toString(),
    role: "assistant",
    content:
      textContent ||
      (canvasResult?.summary
        ? `✅ ${canvasResult.summary}`
        : "Architecture analyzed."),
    toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
    appliedToCanvas: !!canvasResult?.applied,
  };

  return {
    message: assistantMessage,
    canvasResult,
  };
}
