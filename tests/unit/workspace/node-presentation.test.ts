import { describe, expect, it } from "vitest";
import {
  nodePresentation,
  nodeSubtitle,
  nodeTextColor,
} from "@/components/canvas/nodes/nodePresentation";

describe("canvas node presentation", () => {
  it.each([
    ["user", "client", "pill"],
    ["gateway", "edge", "card"],
    ["server", "compute", "card"],
    ["database", "data", "database"],
    ["cache", "data", "card"],
    ["queue", "async", "queue"],
    ["api", "external", "external"],
    ["k8s-cronjob", "async", "card"],
    ["unrecognized", "compute", "card"],
  ] as const)(
    "classifies %s without changing its saved type",
    (type, layer, shape) => {
      expect(nodePresentation(type)).toEqual({ layer, shape });
    },
  );
  it("shows a useful provider or role without repeating the title", () => {
    expect(nodeSubtitle("database", "Main database", "PostgreSQL")).toBe(
      "PostgreSQL",
    );
    expect(nodeSubtitle("database", "Database", undefined)).toBeUndefined();
    expect(nodeSubtitle("gateway", "Production gateway", undefined)).toBe(
      "API gateway",
    );
  });
  it("chooses readable text for light and dark custom backgrounds", () => {
    expect(nodeTextColor("#fff")).toBe("#1c2023");
    expect(nodeTextColor("#111827")).toBe("#fff");
    expect(nodeTextColor(undefined, true)).toBe("#fff");
  });
});
