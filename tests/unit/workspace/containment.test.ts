import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  calculateContainment,
  calculateGlobalPosition,
  getAbsoluteNodePosition,
  orderNodesByHierarchy,
} from "@/features/workspace/utils/containment";

function node(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId?: string,
): Node {
  return {
    id,
    type,
    position: { x, y },
    width,
    height,
    ...(parentId ? { parentId } : {}),
    data: { label: id },
  };
}

describe("workspace containment", () => {
  it("uses absolute coordinates and chooses the deepest eligible container", () => {
    const region = node("region", "region", 100, 100, 900, 700);
    const vpc = node("vpc", "vpc", 80, 80, 700, 500, "region");
    const zone = node("zone", "availability-zone", 40, 60, 600, 380, "vpc");
    const service = node("service", "server", 120, 100, 168, 96, "zone");
    const nodes = [region, vpc, zone, service];

    expect(getAbsoluteNodePosition(service, nodes)).toEqual({ x: 340, y: 340 });
    expect(calculateContainment(service, nodes)).toEqual({
      parentId: "zone",
      localPosition: { x: 120, y: 100 },
    });
  });

  it("does not contain a node whose frame would cross a container boundary", () => {
    const vpc = node("vpc", "vpc", 100, 100, 600, 408);
    const tooWide = node("db", "database", 600, 160, 144, 120);

    expect(calculateContainment(tooWide, [vpc, tooWide])).toEqual({});
  });

  it("calculates a global position through every parent when detaching", () => {
    const region = node("region", "region", 100, 100, 900, 700);
    const vpc = node("vpc", "vpc", 50, 50, 700, 500, "region");
    const service = node("service", "server", 20, 20, 168, 96, "vpc");
    const nodes = [region, vpc, service];

    expect(calculateGlobalPosition(service, nodes)).toEqual({ x: 170, y: 170 });
  });

  it("orders parents before children without dropping invalid records", () => {
    const parent = node("vpc", "vpc", 0, 0, 600, 408);
    const child = node("service", "server", 50, 60, 168, 96, "vpc");
    const orphan = node("orphan", "server", 0, 0, 168, 96, "missing");

    expect(
      orderNodesByHierarchy([child, orphan, parent]).map((item) => item.id),
    ).toEqual(["vpc", "service", "orphan"]);
  });
});
