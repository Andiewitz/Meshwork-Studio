import { describe, it, expect, vi } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { executeEditCanvas } from "@/features/workspace/agent/tools/canvasToolExecutor";
import {
  formatCanvasContext,
  formatMemoriesContext,
  runJenkosAgent,
  JenkosAgentMessage,
} from "@/features/workspace/agent/jenkosAgent";

// Mock secureFetch for agent execution
vi.mock("@/lib/secure-fetch", () => ({
  secureFetch: vi.fn(),
}));

import { secureFetch } from "@/lib/secure-fetch";
const mockedSecureFetch = vi.mocked(secureFetch);

describe("Jenkos Agent & Architecture Generation Pipeline", () => {
  const viewportCenter = { x: 500, y: 300 };

  describe("executeEditCanvas Tool Execution", () => {
    it("creates a VPC container and correctly nests child microservices inside it", () => {
      const initialNodes: Node[] = [];
      const initialEdges: Edge[] = [];

      const toolArgs = {
        action: "add" as const,
        explanation: "Create Production VPC with Auth and API Gateway inside",
        nodes: [
          {
            id: "vpc-prod",
            type: "vpc",
            label: "Production VPC",
            width: 500,
            height: 350,
          },
          {
            id: "gw-1",
            type: "gateway",
            label: "API Gateway",
            parentId: "vpc-prod",
          },
          {
            id: "svc-auth",
            type: "microservice",
            label: "Auth Service",
            parentId: "vpc-prod",
          },
        ],
        edges: [
          {
            source: "gw-1",
            target: "svc-auth",
            label: "HTTPS / REST",
          },
        ],
      };

      const result = executeEditCanvas(
        initialNodes,
        initialEdges,
        toolArgs,
        viewportCenter,
      );

      expect(result.applied).toBe(true);
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(1);

      const vpcNode = result.nodes.find((n) => n.id === "vpc-prod");
      const gwNode = result.nodes.find((n) => n.id === "gw-1");
      const authNode = result.nodes.find((n) => n.id === "svc-auth");

      expect(vpcNode).toBeDefined();
      expect(gwNode?.parentId).toBe("vpc-prod");
      expect(gwNode?.extent).toBe("parent");
      expect(authNode?.parentId).toBe("vpc-prod");
      expect(authNode?.extent).toBe("parent");
      expect(result.edges[0].source).toBe("gw-1");
      expect(result.edges[0].target).toBe("svc-auth");
      expect(result.edges[0].label).toBe("HTTPS / REST");
    });

    it("performs incremental node additions without wiping existing canvas nodes", () => {
      const existingNodes: Node[] = [
        {
          id: "app-1",
          type: "app",
          position: { x: 100, y: 100 },
          data: { label: "Frontend App" },
        },
      ];
      const existingEdges: Edge[] = [];

      const toolArgs = {
        action: "add" as const,
        explanation: "Add backend server connected to frontend",
        nodes: [
          {
            id: "server-1",
            type: "server",
            label: "API Server",
          },
        ],
        edges: [
          {
            source: "app-1",
            target: "server-1",
            label: "REST API",
          },
        ],
      };

      const result = executeEditCanvas(
        existingNodes,
        existingEdges,
        toolArgs,
        viewportCenter,
      );

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map((n) => n.id)).toContain("app-1");
      expect(result.nodes.map((n) => n.id)).toContain("server-1");
      expect(result.edges).toHaveLength(1);
    });

    it("handles targeted deletions of nodes and dependent edges", () => {
      const existingNodes: Node[] = [
        {
          id: "n1",
          type: "server",
          position: { x: 0, y: 0 },
          data: { label: "Server" },
        },
        {
          id: "n2",
          type: "database",
          position: { x: 200, y: 0 },
          data: { label: "Old DB" },
        },
      ];
      const existingEdges: Edge[] = [{ id: "e1", source: "n1", target: "n2" }];

      const result = executeEditCanvas(
        existingNodes,
        existingEdges,
        {
          action: "delete",
          explanation: "Remove deprecated database",
          deleteNodeIds: ["n2"],
        },
        viewportCenter,
      );

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe("n1");
      // Connected edge must be automatically removed
      expect(result.edges).toHaveLength(0);
    });
  });

  describe("Jenkos Agent Run Loop with Tool Calling & Memory", () => {
    it("handles native LLM function tool call and applies canvas mutations", async () => {
      const initialNodes: Node[] = [];
      const initialEdges: Edge[] = [];
      const memories = [
        {
          key: "Security Standard",
          content:
            "All databases must be in private subnets with encryption at rest",
          category: "architectural_decision",
        },
      ];

      mockedSecureFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  "I have created the Redis cache and connected it to the API Gateway.",
                tool_calls: [
                  {
                    id: "call_123",
                    type: "function",
                    function: {
                      name: "edit_canvas",
                      arguments: JSON.stringify({
                        action: "add",
                        explanation: "Add Redis cluster",
                        nodes: [
                          {
                            id: "cache-1",
                            type: "cache",
                            label: "Redis Cluster",
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as Response);

      const runResponse = await runJenkosAgent({
        userPrompt: "Add a cache for fast lookups",
        history: [],
        currentNodes: initialNodes,
        currentEdges: initialEdges,
        viewportCenter,
        memories,
      });

      expect(runResponse.message.role).toBe("assistant");
      expect(runResponse.canvasResult?.applied).toBe(true);
      expect(runResponse.canvasResult?.nodes).toHaveLength(1);
      expect(runResponse.canvasResult?.nodes[0].id).toBe("cache-1");
    });

    it("accumulates multiple tool calls into one canvas result", async () => {
      mockedSecureFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_add_gateway",
                    type: "function",
                    function: {
                      name: "edit_canvas",
                      arguments: JSON.stringify({
                        action: "add",
                        nodes: [
                          {
                            id: "gateway-1",
                            type: "gateway",
                            label: "Gateway",
                          },
                        ],
                      }),
                    },
                  },
                  {
                    id: "call_add_database",
                    type: "function",
                    function: {
                      name: "edit_canvas",
                      arguments: JSON.stringify({
                        action: "add",
                        nodes: [
                          {
                            id: "database-1",
                            type: "database",
                            label: "Database",
                          },
                        ],
                        edges: [
                          {
                            source: "gateway-1",
                            target: "database-1",
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as Response);

      const response = await runJenkosAgent({
        userPrompt: "Add a gateway and database",
        history: [],
        currentNodes: [],
        currentEdges: [],
        viewportCenter,
      });

      expect(response.canvasResult?.nodes.map((node) => node.id)).toEqual([
        "gateway-1",
        "database-1",
      ]);
      expect(response.canvasResult?.edges).toHaveLength(1);
      expect(response.message.toolCalls).toHaveLength(2);
    });

    it("parses fallback markdown JSON codeblocks gracefully if LLM omits native tool_calls", async () => {
      mockedSecureFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: `Here is the architecture:\n\`\`\`json\n{\n  "nodes": [{"id": "db-1", "type": "database", "data": {"label": "PostgreSQL"}}],\n  "edges": []\n}\n\`\`\``,
              },
            },
          ],
        }),
      } as Response);

      const runResponse = await runJenkosAgent({
        userPrompt: "Deploy Postgres",
        history: [],
        currentNodes: [],
        currentEdges: [],
        viewportCenter,
      });

      expect(runResponse.canvasResult?.applied).toBe(true);
      expect(runResponse.canvasResult?.nodes[0].id).toBe("db-1");
    });
  });
});
