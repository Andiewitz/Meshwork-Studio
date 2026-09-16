import { describe, expect, it } from "vitest";
import { nodeDimensions } from "@/features/workspace/utils/dimensions";
import {
  CONTAINER_TYPES,
  getNodeSize,
  NODE_SIZES,
  resolveNodeType,
} from "@/features/workspace/utils/nodeRegistry";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";

describe("node registry", () => {
  it("uses the same defaults for manual and AI-created nodes", () => {
    expect(nodeDimensions).toBe(NODE_SIZES);
    expect(getNodeSize("database")).toEqual({ w: 144, h: 120 });
    expect(getNodeSize("lambda")).toEqual(getNodeSize("logic"));
  });

  it("registers VPC hierarchy types as containers", () => {
    expect([...CONTAINER_TYPES]).toEqual(
      expect.arrayContaining(["vpc", "availability-zone", "subnet"]),
    );
    expect(getNodeSize("availability-zone")).toEqual({ w: 552, h: 336 });
    expect(getNodeSize("subnet")).toEqual({ w: 408, h: 216 });
  });

  it("keeps registered mixed-case and unknown AI types meaningful", () => {
    expect(resolveNodeType("loadBalancer").type).toBe("loadBalancer");
    expect(resolveNodeType("k8s-replicaset").type).toBe("k8s-replicaset");
    expect(resolveNodeType("availability-zone").type).toBe("availability-zone");

    const repaired = validateAndRepairCanvas({
      nodes: [
        {
          id: "custom-component",
          type: "EventBridge Pipe",
          position: { x: 0, y: 0 },
          data: { label: "Event bridge pipe" },
        },
      ],
      edges: [],
    });

    expect(repaired?.nodes[0].type).toBe("generic");
    expect(repaired?.nodes[0].data.originalType).toBe("EventBridge Pipe");
  });
});
