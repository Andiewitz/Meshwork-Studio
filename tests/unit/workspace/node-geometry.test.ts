import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  getNodeDimensions,
  normalizeNodeDimensions,
  withNodeDimensions,
} from "@/features/workspace/utils/nodeGeometry";

const legacyNode: Node = {
  id: "legacy-vpc",
  type: "vpc",
  position: { x: 0, y: 0 },
  data: { label: "Legacy VPC" },
  style: { width: 640, height: 420, borderColor: "#abc" },
};

describe("node geometry", () => {
  it("migrates legacy style dimensions without changing user sizes", () => {
    const [normalized] = normalizeNodeDimensions([legacyNode]);

    expect(getNodeDimensions(normalized)).toEqual({ width: 640, height: 420 });
    expect(normalized.width).toBe(640);
    expect(normalized.height).toBe(420);
    expect(normalized.style).toEqual({ borderColor: "#abc" });
  });

  it("keeps a property edit authoritative after a React Flow resize", () => {
    const resized: Node = {
      ...legacyNode,
      width: 800,
      height: 600,
      measured: { width: 800, height: 600 },
    };
    const propertyEdited = withNodeDimensions(resized, { width: 1008 });

    expect(getNodeDimensions(propertyEdited)).toEqual({
      width: 1008,
      height: 600,
    });
    expect(propertyEdited.style?.width).toBeUndefined();
    expect(propertyEdited.width).toBe(1008);
  });
});
