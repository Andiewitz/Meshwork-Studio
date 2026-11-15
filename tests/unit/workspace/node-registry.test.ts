import { describe, expect, it } from "vitest";
import {
  CONTAINER_TYPES,
  getNodeSize,
  NODE_SIZES,
  NODE_DEFINITIONS,
  TYPE_ALIASES,
  resolveNodeType,
} from "@/features/workspace/utils/nodeRegistry";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";

describe("node registry", () => {
  it("defines each persisted type once with valid, unambiguous aliases", () => {
    const ids = NODE_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.keys(NODE_SIZES).sort());
    for (const definition of NODE_DEFINITIONS) {
      expect(definition.version).toBe(1);
      expect(definition.size.w).toBeGreaterThan(0);
      expect(definition.size.h).toBeGreaterThan(0);
      for (const alias of definition.aliases) {
        expect(TYPE_ALIASES[alias]).toBe(definition.id);
        expect(resolveNodeType(alias).type).toBe(definition.id);
      }
    }
    expect(
      NODE_DEFINITIONS.flatMap((definition) => definition.aliases).sort(),
    ).toEqual(Object.keys(TYPE_ALIASES).sort());
  });
  it("uses the same defaults for manual and AI-created nodes", () => {
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
