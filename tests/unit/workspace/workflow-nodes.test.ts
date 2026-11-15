import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { canvasSnapshotSyncSchema } from "@shared/canvas";
import {
  searchNodeCatalog,
  nodeTypes,
} from "@/features/workspace/utils/nodeTypes";
import {
  calculateContainment,
  expandNodeSubtreeIds,
} from "@/features/workspace/utils/containment";
import { getNodeSize } from "@/features/workspace/utils/nodeRegistry";
import { nodePresentation } from "@/components/canvas/nodes/nodePresentation";

describe("workflow nodes", () => {
  it("exposes the workflow roles through the existing searchable catalog", () => {
    const ids = searchNodeCatalog("workflow").map((node) => node.type);
    expect(ids).toEqual(
      expect.arrayContaining([
        "workflow-task",
        "workflow-decision",
        "workflow-event",
        "workflow-input",
        "workflow-output",
        "workflow-lane",
      ]),
    );
    for (const id of ids) expect(nodeTypes[id]).toBeDefined();
    expect(nodePresentation("workflow-event").shape).toBe("pill");
  });
  it("contains steps in a swimlane and preserves their graph on save", () => {
    const lane: Node = {
      id: "lane",
      type: "workflow-lane",
      position: { x: 0, y: 0 },
      data: { label: "Support" },
      width: getNodeSize("workflow-lane").w,
      height: getNodeSize("workflow-lane").h,
    };
    const step: Node = {
      id: "step",
      type: "workflow-task",
      position: { x: 40, y: 60 },
      data: { label: "Review request" },
    };
    expect(calculateContainment(step, [lane, step])).toEqual({
      parentId: "lane",
      localPosition: { x: 40, y: 60 },
    });
    const nested = { ...step, parentId: "lane", extent: "parent" as const };
    expect([...expandNodeSubtreeIds([lane, nested], ["lane"])].sort()).toEqual([
      "lane",
      "step",
    ]);
    expect(
      canvasSnapshotSyncSchema.safeParse({
        nodes: [lane, nested],
        edges: [],
        baseRevision: 0,
      }).success,
    ).toBe(true);
  });
});
