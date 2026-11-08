import { describe, expect, it } from "vitest";
import {
  architecturePlanSchema,
  planToMarkdown,
} from "@shared/architecture-plan";
import {
  canvasFingerprint,
  validatePlanGraph,
} from "@/features/workspace/agent/architecturePlanner";
import type { Node } from "@xyflow/react";

const plan = {
  title: "Small service",
  summary: "A service and database.",
  assumptions: ["Low traffic"],
  risks: ["Single database"],
  components: [
    { id: "api", type: "server", label: "API" },
    { id: "db", type: "database", label: "Database" },
  ],
  connections: [{ source: "api", target: "db", kind: "sync" as const }],
};
describe("reviewable architecture plans", () => {
  it("includes the architecture and its tradeoffs in readable Markdown", () => {
    const markdown = planToMarkdown(architecturePlanSchema.parse(plan));
    expect(markdown).toContain("Low traffic");
    expect(markdown).toContain("Single database");
    expect(markdown).toContain("api → db");
  });
  it("rejects duplicate IDs, unknown endpoints, ID collisions and cyclic groups", () => {
    expect(
      architecturePlanSchema.safeParse({
        ...plan,
        components: [plan.components[0], plan.components[0]],
      }).success,
    ).toBe(false);
    expect(() =>
      validatePlanGraph(
        { ...plan, connections: [{ source: "api", target: "missing" }] },
        [],
      ),
    ).toThrow(/endpoint/);
    expect(() =>
      validatePlanGraph(plan, [
        { id: "api", type: "server", position: { x: 0, y: 0 }, data: {} },
      ]),
    ).toThrow(/already exists/);
    expect(() =>
      validatePlanGraph(
        {
          ...plan,
          components: [
            { id: "a", type: "vpc", label: "A", parentId: "b" },
            { id: "b", type: "vpc", label: "B", parentId: "a" },
          ],
          connections: [],
        },
        [],
      ),
    ).toThrow(/cycle/);
  });
  it("detects meaningful edits but ignores selection and node ordering", () => {
    const a: Node = { id: "a", position: { x: 0, y: 0 }, data: { label: "A" } };
    const b: Node = {
      id: "b",
      position: { x: 10, y: 0 },
      data: { label: "B" },
    };
    expect(canvasFingerprint([a, b], [])).toBe(
      canvasFingerprint([{ ...b, selected: true }, a], []),
    );
    expect(canvasFingerprint([a, b], [])).not.toBe(
      canvasFingerprint([{ ...a, data: { label: "Changed" } }, b], []),
    );
  });
});
