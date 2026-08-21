import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { executeEditCanvas } from "@/features/workspace/agent/tools/canvasToolExecutor";
import {
  formatCanvasContext,
  MOSH_TOOLS,
} from "@/features/workspace/agent/moshAgent";

describe("Mosh AI Agent Tool Calling & Execution Unit Tests", () => {
  const initialNodes: Node[] = [
    {
      id: "api-gw",
      type: "gateway",
      position: { x: 200, y: 200 },
      data: { label: "API Gateway", description: "Entrypoint" },
    },
    {
      id: "backend-svc",
      type: "microservice",
      position: { x: 450, y: 200 },
      data: { label: "Order Service", description: "Business logic" },
    },
  ];

  const initialEdges: Edge[] = [
    {
      id: "e1",
      source: "api-gw",
      target: "backend-svc",
      label: "HTTPS",
    },
  ];

  describe("executeEditCanvas: Incremental Tool Mutations", () => {
    it("should incrementally add nodes and connect them to existing nodes without overwriting", () => {
      const result = executeEditCanvas(
        initialNodes,
        initialEdges,
        {
          action: "add",
          explanation:
            "Added PostgreSQL database and connected to backend service.",
          nodes: [
            {
              id: "postgres-db",
              type: "database",
              label: "PostgreSQL Primary",
              description: "Persistent storage",
            },
          ],
          edges: [
            {
              id: "e-backend-db",
              source: "backend-svc",
              target: "postgres-db",
              label: "SQL",
            },
          ],
        },
        { x: 500, y: 300 },
      );

      expect(result.applied).toBe(true);
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      // Verify existing nodes were kept intact
      const existingGateway = result.nodes.find((n) => n.id === "api-gw");
      expect(existingGateway).toBeDefined();
      expect(existingGateway?.position).toEqual({ x: 200, y: 200 });

      // Verify new node
      const newDb = result.nodes.find((n) => n.id === "postgres-db");
      expect(newDb).toBeDefined();
      expect(newDb?.type).toBe("database");
      expect(newDb?.data.label).toBe("PostgreSQL Primary");

      // Verify new edge
      const newEdge = result.edges.find((e) => e.target === "postgres-db");
      expect(newEdge).toBeDefined();
      expect(newEdge?.source).toBe("backend-svc");
      expect(result.summary).toContain("Added PostgreSQL database");
    });

    it("should update existing nodes while preserving unchanged properties and coordinates", () => {
      const result = executeEditCanvas(initialNodes, initialEdges, {
        action: "update",
        explanation:
          "Updated API Gateway to include rate limiting note and custom color.",
        nodes: [
          {
            id: "api-gw",
            type: "gateway",
            label: "Kong API Gateway (WAF Enabled)",
            accentColor: "#FF6B35",
            note: "Rate limited to 1000 req/min",
          },
        ],
      });

      expect(result.applied).toBe(true);
      expect(result.nodes).toHaveLength(2);
      const updatedGateway = result.nodes.find((n) => n.id === "api-gw");
      expect(updatedGateway?.data.label).toBe("Kong API Gateway (WAF Enabled)");
      expect(updatedGateway?.data.note).toBe("Rate limited to 1000 req/min");
      expect(updatedGateway?.data.accentColor).toBe("#FF6B35");
      expect(updatedGateway?.position).toEqual({ x: 200, y: 200 }); // Position preserved
    });

    it("should cleanly delete specified nodes and cascade-delete their connected edges", () => {
      const result = executeEditCanvas(initialNodes, initialEdges, {
        action: "delete",
        explanation: "Removed backend service from diagram.",
        deleteNodeIds: ["backend-svc"],
      });

      expect(result.applied).toBe(true);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe("api-gw");
      expect(result.edges).toHaveLength(0); // Edge connected to backend-svc was removed
    });

    it("should handle full canvas replace_all when explicitly requested", () => {
      const result = executeEditCanvas(
        initialNodes,
        initialEdges,
        {
          action: "replace_all",
          explanation: "Built brand new Kubernetes cluster topology.",
          nodes: [
            { id: "k8s-pod-1", type: "k8s-pod", label: "Pod Alpha" },
            { id: "k8s-pod-2", type: "k8s-pod", label: "Pod Beta" },
          ],
          edges: [{ source: "k8s-pod-1", target: "k8s-pod-2", label: "gRPC" }],
        },
        { x: 300, y: 300 },
      );

      expect(result.applied).toBe(true);
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.nodes.map((n) => n.id)).toEqual(["k8s-pod-1", "k8s-pod-2"]);
    });
  });

  describe("formatCanvasContext & Tool Declarations", () => {
    it("should format empty canvas state cleanly", () => {
      const context = formatCanvasContext([], [], { x: 300, y: 200 });
      expect(context).toContain("Empty canvas");
      expect(context).toContain("VIEWPORT CENTER: x=300, y=200");
    });

    it("should format populated canvas JSON with node IDs, types, and connections", () => {
      const context = formatCanvasContext(initialNodes, initialEdges, {
        x: 400,
        y: 300,
      });
      expect(context).toContain("CURRENT CANVAS STATE (2 nodes, 1 edges)");
      expect(context).toContain("api-gw");
      expect(context).toContain("backend-svc");
      expect(context).toContain("HTTPS");
    });

    it("should provide valid MOSH_TOOLS declarations", () => {
      expect(MOSH_TOOLS).toBeDefined();
      expect(MOSH_TOOLS[0].type).toBe("function");
      expect(MOSH_TOOLS[0].function.name).toBe("edit_canvas");
      expect(MOSH_TOOLS[0].function.parameters.properties).toHaveProperty(
        "action",
      );
      expect(MOSH_TOOLS[0].function.parameters.properties).toHaveProperty(
        "nodes",
      );
      expect(MOSH_TOOLS[0].function.parameters.properties).toHaveProperty(
        "edges",
      );
    });
  });
});
