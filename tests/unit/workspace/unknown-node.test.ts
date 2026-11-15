import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  mapNodeType,
  nodeForRendering,
} from "@/features/workspace/utils/unknownNode";
import { canvasJsonSchema } from "@/features/workspace/utils/exportCanvas";

describe("unknown node types", () => {
  it("renders an unknown type generically without changing saved content", () => {
    const node: Node = {
      id: "x",
      type: "custom.product",
      position: { x: 8, y: 4 },
      data: { label: "Custom", custom: { enabled: true } },
      width: 240,
    };
    const rendered = nodeForRendering(node);
    expect(rendered.type).toBe("generic");
    expect(rendered.data.originalType).toBe("custom.product");
    expect(rendered.data.custom).toEqual({ enabled: true });
    expect(node.type).toBe("custom.product");
    expect(node.data.originalType).toBeUndefined();
    const parsed = canvasJsonSchema.parse({
      title: "test",
      nodes: [node],
      edges: [],
      exportedAt: "now",
    });
    expect(parsed.nodes[0].type).toBe("custom.product");
    expect(parsed.nodes[0].data.custom).toEqual({ enabled: true });
    expect(parsed.nodes[0].width).toBe(240);
  });
  it("uses canonical renderers for legacy aliases and respects existing provenance", () => {
    const node: Node = {
      id: "x",
      type: "postgres",
      position: { x: 0, y: 0 },
      data: { custom: 1 },
    };
    expect(nodeForRendering(node).type).toBe("database");
    const unknown = {
      ...node,
      type: "other",
      data: { originalType: "older type" },
    };
    expect(nodeForRendering(unknown).data.originalType).toBe("older type");
  });
  it("maps explicitly while preserving data, dimensions and original type", () => {
    const node: Node = {
      id: "x",
      type: "custom.product",
      position: { x: 1, y: 2 },
      width: 220,
      data: { label: "Custom", custom: { value: 3 } },
    };
    const mapped = mapNodeType(node, "database");
    expect(mapped.type).toBe("database");
    expect(mapped.data).toEqual({
      ...node.data,
      originalType: "custom.product",
    });
    expect(mapped.width).toBe(220);
    expect(mapped.position).toEqual(node.position);
    expect(node.type).toBe("custom.product");
    expect(() => mapNodeType(node, "template:airbnb")).toThrow();
  });
});
