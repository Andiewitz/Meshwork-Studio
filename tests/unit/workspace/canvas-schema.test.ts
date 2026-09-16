import { describe, expect, it } from "vitest";
import { canvasSyncSchema } from "@shared/canvas";

const node = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "custom-service",
  position: { x: 0, y: 0 },
  data: { label: id, futureMetadata: { retained: true } },
  ...overrides,
});

describe("canvas sync schema", () => {
  it("accepts custom component types and extensible metadata", () => {
    const result = canvasSyncSchema.safeParse({
      nodes: [node("source"), node("target", { parentId: "source" })],
      edges: [{ id: "edge", source: "source", target: "target" }],
      baseRevision: 0,
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed records and broken graph references", () => {
    const result = canvasSyncSchema.safeParse({
      nodes: [node("duplicate"), node("duplicate", { parentId: "missing" })],
      edges: [{ id: "edge", source: "duplicate", target: "missing" }],
      baseRevision: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Duplicate node ID: duplicate",
          "Parent node does not exist: missing",
          "Edge source and target must both exist in the canvas.",
        ]),
      );
    }
  });

  it("rejects parent cycles before a save can persist them", () => {
    const result = canvasSyncSchema.safeParse({
      nodes: [node("a", { parentId: "b" }), node("b", { parentId: "a" })],
      edges: [],
      baseRevision: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes("cycle")),
      ).toBe(true);
    }
  });
});
