import type { Node } from "@xyflow/react";
import { getNodeSize } from "./nodeRegistry";

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Returns the persisted frame size, with a compatibility fallback for legacy nodes. */
export function getNodeDimensions(node: Node): {
  width: number;
  height: number;
} {
  const defaults = getNodeSize(node.type);
  return {
    width:
      positiveNumber(node.width) ??
      positiveNumber(node.measured?.width) ??
      positiveNumber(node.style?.width) ??
      defaults.w,
    height:
      positiveNumber(node.height) ??
      positiveNumber(node.measured?.height) ??
      positiveNumber(node.style?.height) ??
      defaults.h,
  };
}

/**
 * React Flow treats top-level dimensions as authoritative. Keep style for
 * appearance only so resize handles, property inputs, hit testing, and saves
 * all read the same frame.
 */
export function withNodeDimensions(
  node: Node,
  dimensions: { width?: number; height?: number },
): Node {
  const current = getNodeDimensions(node);
  const width = positiveNumber(dimensions.width) ?? current.width;
  const height = positiveNumber(dimensions.height) ?? current.height;
  const style = { ...node.style };
  delete style.width;
  delete style.height;

  return { ...node, width, height, style };
}

/** Migrates legacy style dimensions in memory without changing user sizes. */
export function normalizeNodeDimensions(nodes: Node[]): Node[] {
  return nodes.map((node) => withNodeDimensions(node, getNodeDimensions(node)));
}
