import { describe, expect, it } from "vitest";
import { MarkerType, type Node } from "@xyflow/react";
import { executeEditCanvas } from "@/features/workspace/agent/tools/canvasToolExecutor";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";
import { canvasSnapshotSyncSchema } from "@shared/canvas";

const design = {
  nodes: [
    { id: "client", type: "app", label: "Web app" },
    { id: "gateway", type: "loadBalancer", label: "Ingress" },
    { id: "api", type: "microservice", label: "Orders" },
    { id: "queue", type: "queue", label: "Events" },
  ],
  edges: [
    {
      source: "client",
      target: "gateway",
      label: "HTTPS",
      kind: "primary" as const,
    },
    { source: "gateway", target: "api", label: "HTTP" },
    { source: "api", target: "queue", label: "publish" },
  ],
};

describe("AI diagram design", () => {
  it.each(["add", "replace_all"] as const)(
    "uses theme-driven nodes and directed, labeled layer-aware flows for %s",
    (action) => {
      const result = executeEditCanvas(
        [],
        [],
        { action, ...design },
        { x: 500, y: 250 },
      );
      expect(result.applied).toBe(true);
      expect(
        result.nodes.every(
          (node) =>
            !node.style?.backgroundColor &&
            !node.style?.borderColor &&
            !node.data.fontColor,
        ),
      ).toBe(true);
      const x = (id: string) =>
        result.nodes.find((node) => node.id === id)!.position.x;
      expect(x("client")).toBeLessThan(x("gateway"));
      expect(x("gateway")).toBeLessThan(x("api"));
      expect(x("api")).toBeLessThan(x("queue"));
      expect(result.edges[0]).toMatchObject({
        label: "HTTPS",
        data: { connectionKind: "primary" },
        style: { stroke: "var(--workspace-connection-primary)" },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
      expect(result.edges[2]).toMatchObject({
        label: "publish",
        data: { connectionKind: "async" },
        style: { strokeDasharray: "8 6" },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
      expect(
        canvasSnapshotSyncSchema.safeParse({
          nodes: result.nodes,
          edges: result.edges,
          baseRevision: 0,
        }).success,
      ).toBe(true);
    },
  );

  it("keeps existing nodes in place and puts an automatically laid-out batch to their right", () => {
    const existing: Node = {
      id: "existing",
      type: "server",
      position: { x: 100, y: 80 },
      width: 200,
      height: 100,
      data: { label: "Keep me" },
      style: { backgroundColor: "#123456" },
    };
    const result = executeEditCanvas([existing], [], {
      action: "add",
      ...design,
    });
    expect(result.nodes.find((node) => node.id === "existing")).toEqual(
      existing,
    );
    for (const node of result.nodes.filter((node) => node.id !== "existing"))
      expect(node.position.x).toBeGreaterThanOrEqual(420);
  });

  it.each(["add", "replace_all"] as const)(
    "keeps AI-requested node sizes within the canvas save limit for %s",
    (action) => {
      const result = executeEditCanvas([], [], {
        action,
        nodes: [
          {
            id: "huge",
            type: "server",
            label: "Service",
            width: 1e20,
            height: 1e20,
          },
        ],
      });
      expect(result.nodes[0].width).toBeLessThanOrEqual(100_000);
      expect(result.nodes[0].height).toBeLessThanOrEqual(100_000);
      expect(
        canvasSnapshotSyncSchema.safeParse({
          nodes: result.nodes,
          edges: result.edges,
          baseRevision: 0,
        }).success,
      ).toBe(true);
    },
  );

  it("keeps explicit coordinates while preventing automatic nodes from overlapping them", () => {
    const result = executeEditCanvas(
      [],
      [],
      {
        action: "replace_all",
        nodes: [
          {
            id: "explicit",
            type: "server",
            label: "Fixed",
            position: { x: 216, y: 332 },
          },
          { id: "automatic", type: "server", label: "Automatic" },
        ],
      },
      { x: 300, y: 300 },
    );
    const fixed = result.nodes.find((node) => node.id === "explicit")!;
    const automatic = result.nodes.find((node) => node.id === "automatic")!;
    expect(fixed.position).toEqual({ x: 216, y: 332 });
    expect(automatic.position.y).toBeGreaterThanOrEqual(
      fixed.position.y + Number(fixed.height),
    );
  });

  it("leaves explicitly chosen appearance intact when repairing imported AI output", () => {
    const repaired = validateAndRepairCanvas({
      nodes: [
        {
          id: "custom",
          type: "database",
          data: { label: "Custom", fontColor: "#010203" },
          style: { backgroundColor: "#abcdef", borderColor: "#112233" },
        },
      ],
      edges: [],
    });
    expect(repaired?.nodes[0]).toMatchObject({
      data: { fontColor: "#010203" },
      style: { backgroundColor: "#abcdef", borderColor: "#112233" },
    });
  });

  it("reserves enough vertical space for automatically grouped children", () => {
    const result = executeEditCanvas([], [], {
      action: "replace_all",
      nodes: [
        { id: "vpc", type: "vpc", label: "Network", width: 420, height: 120 },
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `svc-${index}`,
          type: "microservice",
          label: `Service ${index}`,
          parentId: "vpc",
        })),
        { id: "other", type: "server", label: "Separate service" },
      ],
    });
    const group = result.nodes.find((node) => node.id === "vpc")!;
    const other = result.nodes.find((node) => node.id === "other")!;
    expect(group.height).toBeGreaterThan(120);
    expect(other.position.y).toBeGreaterThanOrEqual(
      group.position.y + Number(group.height),
    );
  });

  it("chooses connection handles after grouped children have been laid out", () => {
    const result = executeEditCanvas([], [], {
      action: "replace_all",
      nodes: [
        { id: "vpc", type: "vpc", label: "Network" },
        { id: "a", type: "microservice", label: "First", parentId: "vpc" },
        { id: "b", type: "microservice", label: "Second", parentId: "vpc" },
      ],
      edges: [{ source: "a", target: "b", label: "HTTP" }],
    });
    expect(result.edges[0]).toMatchObject({
      sourceHandle: "bottom",
      targetHandle: "top-target",
    });
  });

  it.each(["add", "replace_all"] as const)(
    "routes request and response as two separate arrows for %s",
    (action) => {
      const result = executeEditCanvas([], [], {
        action,
        nodes: [
          { id: "client", type: "app", label: "Client" },
          { id: "api", type: "microservice", label: "API" },
        ],
        edges: [
          { source: "client", target: "api", label: "request" },
          { source: "api", target: "client", label: "response" },
        ],
      });
      expect(result.edges).toHaveLength(2);
      expect(result.edges[0]).toMatchObject({
        sourceHandle: "right",
        targetHandle: "left-target",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
      expect(result.edges[1]).toMatchObject({
        sourceHandle: "bottom",
        targetHandle: "bottom-target",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    },
  );
});
