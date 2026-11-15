import { describe, expect, it } from "vitest";
import { getNodeIdentity } from "@/features/workspace/utils/nodeIdentity";
import {
  mapNodeType,
  nodeForRendering,
} from "@/features/workspace/utils/unknownNode";
import { nodeSubtitle } from "@/components/canvas/nodes/nodePresentation";
import { executeEditCanvas } from "@/features/workspace/agent/tools/canvasToolExecutor";

describe("node roles and technologies", () => {
  it("infers a legacy product without changing the saved node", () => {
    const node = {
      id: "db",
      type: "postgres",
      position: { x: 0, y: 0 },
      data: { label: "Orders", other: 3 },
    };
    expect(getNodeIdentity(node.type, node.data)).toEqual({
      role: "database",
      technology: "PostgreSQL",
      provider: undefined,
    });
    const rendered = nodeForRendering(node);
    expect(rendered.type).toBe("database");
    expect(rendered.data.technology).toBe("PostgreSQL");
    expect(node).toEqual({
      id: "db",
      type: "postgres",
      position: { x: 0, y: 0 },
      data: { label: "Orders", other: 3 },
    });
  });
  it("keeps product and provider independent and respects an explicit empty value", () => {
    expect(
      getNodeIdentity("redis", { technology: "", provider: "AWS" }),
    ).toEqual({ role: "cache", technology: "", provider: "AWS" });
    expect(getNodeIdentity("snowflake").role).toBe("database");
    expect(
      nodeSubtitle("database", "Orders", "AWS", undefined, "PostgreSQL"),
    ).toBe("PostgreSQL · AWS");
    expect(nodeSubtitle("database", "Orders", "AWS", undefined, "AWS")).toBe(
      "AWS",
    );
  });
  it("preserves the inferred product when a legacy role is changed", () => {
    const node = {
      id: "db",
      type: "snowflake",
      position: { x: 10, y: 20 },
      width: 144,
      data: { label: "Warehouse", provider: "AWS", custom: true },
    };
    const mapped = mapNodeType(node, "database");
    expect(mapped).toMatchObject({
      id: "db",
      type: "database",
      width: 144,
      data: {
        label: "Warehouse",
        provider: "AWS",
        technology: "Snowflake",
        originalType: "snowflake",
        custom: true,
      },
    });
    expect(node.type).toBe("snowflake");
  });
  it.each(["add", "replace_all"] as const)(
    "keeps an AI product alias for %s",
    (action) => {
      const result = executeEditCanvas([], [], {
        action,
        nodes: [{ id: "cache", type: "redis", label: "Sessions" }],
      });
      expect(result.nodes[0].type).toBe("cache");
      expect(result.nodes[0].data.technology).toBe("Redis");
    },
  );
});
