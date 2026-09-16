import { z } from "zod";

const finiteNumber = z.number().finite();
const positionSchema = z.object({ x: finiteNumber, y: finiteNumber });

/**
 * Canvas data remains extensible: node types and metadata are not closed
 * enums. We validate graph integrity instead of discarding future component
 * types produced by imports or AI.
 */
export const canvasNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    type: z.string().trim().min(1).max(100).optional().nullable(),
    position: positionSchema,
    data: z.record(z.string(), z.unknown()),
    parentId: z.string().trim().min(1).max(200).optional().nullable(),
    extent: z.string().max(50).optional().nullable(),
    width: finiteNumber.positive().max(100_000).optional().nullable(),
    height: finiteNumber.positive().max(100_000).optional().nullable(),
    style: z.record(z.string(), z.unknown()).optional().nullable(),
    measured: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .passthrough();

export const canvasEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    source: z.string().trim().min(1).max(200),
    target: z.string().trim().min(1).max(200),
  })
  .passthrough();

function addGraphIssues(
  value: {
    nodes: z.infer<typeof canvasNodeSchema>[];
    edges: z.infer<typeof canvasEdgeSchema>[];
  },
  ctx: z.RefinementCtx,
): void {
  const nodeIds = new Set<string>();
  const nodeIndexes = new Map<string, number>();

  value.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["nodes", index, "id"],
        message: `Duplicate node ID: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
    nodeIndexes.set(node.id, index);
  });

  value.nodes.forEach((node, index) => {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      ctx.addIssue({
        code: "custom",
        path: ["nodes", index, "parentId"],
        message: `Parent node does not exist: ${node.parentId}`,
      });
    }
  });

  value.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      ctx.addIssue({
        code: "custom",
        path: ["edges", index],
        message: "Edge source and target must both exist in the canvas.",
      });
    }
  });

  for (const node of value.nodes) {
    const path = new Set<string>();
    let current = node;
    while (current.parentId) {
      if (path.has(current.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", nodeIndexes.get(node.id) ?? 0, "parentId"],
          message: "Canvas parent hierarchy contains a cycle.",
        });
        break;
      }
      path.add(current.id);
      const parentIndex = nodeIndexes.get(current.parentId);
      if (parentIndex === undefined) break;
      current = value.nodes[parentIndex];
    }
  }
}

export const canvasSyncSchema = z
  .object({
    nodes: z.array(canvasNodeSchema).max(5_000),
    edges: z.array(canvasEdgeSchema).max(10_000),
    baseRevision: z.number().int().nonnegative(),
  })
  .superRefine(addGraphIssues);
