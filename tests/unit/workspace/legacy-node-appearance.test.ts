import { describe, expect, it } from "vitest";
import {
  hasLegacyDefaultAppearance,
  prepareLegacyNodeForEdit,
} from "@/components/canvas/nodes/legacyNodeAppearance";
import type { Node } from "@xyflow/react";
const brand = { color: "#4169E1", borderColor: "#3050B0" };
function oldNode(): Node {
  return {
    id: "db",
    type: "database",
    position: { x: 0, y: 0 },
    data: {
      label: "Orders",
      fontColor: "#ffffff",
      theme: "default",
      icon: null,
    },
    style: {
      backgroundColor: brand.color,
      borderColor: brand.borderColor,
      borderRadius: 8,
      opacity: 1,
      fontSize: 13,
    },
  };
}
describe("legacy node appearance", () => {
  it("removes old defaults only in the edited copy, preserving the original", () => {
    const original = oldNode();
    expect(hasLegacyDefaultAppearance(original, brand)).toBe(true);
    const edited = prepareLegacyNodeForEdit(original, brand);
    expect(edited.style).toEqual({});
    expect(edited.data).not.toHaveProperty("fontColor");
    expect(original.style?.backgroundColor).toBe("#4169E1");
    expect(original.data.fontColor).toBe("#ffffff");
  });
  it("preserves saved custom appearances intact", () => {
    const customized = oldNode();
    customized.style = { ...customized.style, backgroundColor: "#334455" };
    expect(hasLegacyDefaultAppearance(customized, brand)).toBe(false);
    expect(prepareLegacyNodeForEdit(customized, brand)).toBe(customized);
  });
});
