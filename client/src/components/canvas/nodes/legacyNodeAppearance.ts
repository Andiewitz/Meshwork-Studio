import type { Node } from "@xyflow/react";

export interface LegacyBrand {
  color: string;
  borderColor: string;
}
export const legacyFallbackBrand: LegacyBrand = {
  color: "#4F46E5",
  borderColor: "#4338CA",
};

/** Older editor-created nodes persisted this exact tuple as their default. */
export function hasLegacyDefaultAppearance(
  node: Pick<Node, "style" | "data">,
  brand: LegacyBrand,
): boolean {
  const style = node.style;
  const { fontColor, icon, theme } = node.data;
  return (
    style?.backgroundColor === brand.color &&
    style.borderColor === brand.borderColor &&
    style.borderRadius === 8 &&
    style.opacity === 1 &&
    style.fontSize === 13 &&
    (!theme || theme === "default") &&
    !icon &&
    (!fontColor ||
      (typeof fontColor === "string" && fontColor.toLowerCase() === "#ffffff"))
  );
}

/** Normalize only when editing: rendering itself must not mutate saved data. */
export function prepareLegacyNodeForEdit(node: Node, brand: LegacyBrand): Node {
  if (!hasLegacyDefaultAppearance(node, brand)) return node;
  const style = { ...node.style };
  delete style.backgroundColor;
  delete style.borderColor;
  delete style.borderRadius;
  delete style.opacity;
  delete style.fontSize;
  const data = { ...node.data };
  delete data.fontColor;
  return { ...node, style, data };
}
