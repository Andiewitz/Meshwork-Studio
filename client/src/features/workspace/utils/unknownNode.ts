import type { Node } from "@xyflow/react";
import { resolveNodeType, VALID_TYPES } from "./nodeRegistry";

/** Supply a renderer without rewriting the persisted type or metadata. */
export function nodeForRendering(node: Node): Node {
  if (!node.type) return node;
  const resolved = resolveNodeType(node.type);
  if (resolved.type === node.type) return node;
  return {
    ...node,
    type: resolved.type,
    data: {
      ...node.data,
      ...(resolved.originalType && !node.data.originalType
        ? { originalType: resolved.originalType }
        : {}),
    },
  };
}

/** Explicitly map a type while keeping its original identity and all data. */
export function mapNodeType(node: Node, type: string): Node {
  if (!VALID_TYPES.has(type)) throw new Error("Unknown target node type.");
  const originalType =
    node.data.originalType || resolveNodeType(node.type).originalType;
  return {
    ...node,
    type,
    data: { ...node.data, ...(originalType ? { originalType } : {}) },
  };
}
