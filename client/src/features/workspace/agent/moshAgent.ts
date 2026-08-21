import type { Node, Edge } from "@xyflow/react";
import { secureFetch } from "@/lib/secure-fetch";
import {
  executeEditCanvas,
  EditCanvasToolArgs,
  CanvasExecutionResult,
} from "./tools/canvasToolExecutor";

export interface MoshAgentMessage {
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

export const MOSH_SYSTEM_PROMPT = `You are Mosh, the expert cloud systems architect and engineering co-pilot for Meshwork Studio.

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

3. **Topology & Connections**:
   - Ensure clean source -> target edge connections with descriptive labels (e.g. "HTTPS", "gRPC", "SQL", "Kafka Consumer").
   - Group private resources inside VPCs or Kubernetes namespaces by specifying their \`parentId\`.
`;

export const MOSH_TOOLS = [
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
 * Serializes current canvas state into structured JSON context for Mosh
 */
export function formatCanvasContext(
  nodes: Node[],
  edges: Edge[],
  viewportCenter: { x: number; y: number },
): string {
  if (nodes.length === 0) {
    return `\n\nCURRENT CANVAS STATE: Empty canvas.\nVIEWPORT CENTER: x=${viewportCenter.x}, y=${viewportCenter.y}.`;
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

  return `\n\nCURRENT CANVAS STATE (${nodes.length} nodes, ${edges.length} edges):
\`\`\`json
${JSON.stringify({ nodes: simplifiedNodes, edges: simplifiedEdges }, null, 2)}
\`\`\`
VIEWPORT CENTER: x=${viewportCenter.x}, y=${viewportCenter.y}.`;
}

export interface SendAgentPromptOptions {
  userPrompt: string;
  history: MoshAgentMessage[];
  currentNodes: Node[];
  currentEdges: Edge[];
  viewportCenter: { x: number; y: number };
  model?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface AgentRunResponse {
  message: MoshAgentMessage;
  canvasResult?: CanvasExecutionResult;
}

/**
 * Runs the Mosh Agent loop against the AI Service
 */
export async function runMoshAgent({
  userPrompt,
  history,
  currentNodes,
  currentEdges,
  viewportCenter,
  model = "gemini-3.5-flash",
  onStatusUpdate,
}: SendAgentPromptOptions): Promise<AgentRunResponse> {
  onStatusUpdate?.("Consulting Mosh...");

  const canvasContext = formatCanvasContext(
    currentNodes,
    currentEdges,
    viewportCenter,
  );
  const fullSystemPrompt = MOSH_SYSTEM_PROMPT + canvasContext;

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
      tools: MOSH_TOOLS,
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
  const executedToolCalls: MoshAgentMessage["toolCalls"] = [];

  if (toolCalls.length > 0) {
    onStatusUpdate?.("Applying architecture modifications...");
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
          currentNodes,
          currentEdges,
          args,
          viewportCenter,
        );
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
              nodes: parsed.nodes,
              edges: parsed.edges,
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

  const assistantMessage: MoshAgentMessage = {
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
