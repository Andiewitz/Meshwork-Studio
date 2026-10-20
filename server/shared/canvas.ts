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

export const canvasChangesSchema = z
  .object({
    upsertNodes: z.array(canvasNodeSchema).max(5_000).optional(),
    upsertEdges: z.array(canvasEdgeSchema).max(10_000).optional(),
    deleteNodeIds: z
      .array(z.string().trim().min(1).max(200))
      .max(10_000)
      .optional(),
    deleteEdgeIds: z
      .array(z.string().trim().min(1).max(200))
      .max(10_000)
      .optional(),
  })
  .superRefine((changes, ctx) => {
    const addDuplicates = (
      ids: string[] | undefined,
      path: "upsertNodes" | "upsertEdges" | "deleteNodeIds" | "deleteEdgeIds",
    ) => {
      if (!ids) return;
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: [path],
            message: `Duplicate ID in ${path}: ${id}`,
          });
        }
        seen.add(id);
      }
    };

    addDuplicates(
      changes.upsertNodes?.map((node) => node.id),
      "upsertNodes",
    );
    addDuplicates(
      changes.upsertEdges?.map((edge) => edge.id),
      "upsertEdges",
    );
    addDuplicates(changes.deleteNodeIds, "deleteNodeIds");
    addDuplicates(changes.deleteEdgeIds, "deleteEdgeIds");

    const deletedNodes = new Set(changes.deleteNodeIds ?? []);
    const deletedEdges = new Set(changes.deleteEdgeIds ?? []);
    for (const node of changes.upsertNodes ?? []) {
      if (deletedNodes.has(node.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["upsertNodes"],
          message: `Node cannot be upserted and deleted in one save: ${node.id}`,
        });
      }
    }
    for (const edge of changes.upsertEdges ?? []) {
      if (deletedEdges.has(edge.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["upsertEdges"],
          message: `Edge cannot be upserted and deleted in one save: ${edge.id}`,
        });
      }
    }

    if (
      !changes.upsertNodes?.length &&
      !changes.upsertEdges?.length &&
      !changes.deleteNodeIds?.length &&
      !changes.deleteEdgeIds?.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["changes"],
        message: "Changes cannot be empty.",
      });
    }
  });

export const canvasDeltaSyncSchema = z.object({
  changes: canvasChangesSchema,
  baseRevision: z.number().int().nonnegative(),
});

export const canvasSnapshotSyncSchema = z
  .object({
    nodes: z.array(canvasNodeSchema).max(5_000),
    edges: z.array(canvasEdgeSchema).max(10_000),
    baseRevision: z.number().int().nonnegative(),
  })
  .superRefine(addGraphIssues);

export const canvasSyncSchema = z.union([
  canvasDeltaSyncSchema,
  canvasSnapshotSyncSchema,
]);

export type CanvasChanges = z.infer<typeof canvasChangesSchema>;

type CanvasNodeInput = z.infer<typeof canvasNodeSchema>;
type CanvasEdgeInput = z.infer<typeof canvasEdgeSchema>;

/**
 * Apply a client delta to a snapshot. Deletes win over stale state, node
 * deletes cascade to attached edges, and upserts replace by ID in place so
 * unchanged ordering is preserved for the next full read.
 */
export function applyCanvasChanges<
  N extends { id: string },
  E extends { id: string; source: string; target: string },
>(
  currentNodes: readonly N[],
  currentEdges: readonly E[],
  changes: CanvasChanges,
): { nodes: (N | CanvasNodeInput)[]; edges: (E | CanvasEdgeInput)[] } {
  const deletedNodes = new Set(changes.deleteNodeIds ?? []);
  const deletedEdges = new Set(changes.deleteEdgeIds ?? []);

  const nodes: (N | CanvasNodeInput)[] = currentNodes.filter(
    (node) => !deletedNodes.has(node.id),
  );
  const nodeIndexes = new Map(nodes.map((node, index) => [node.id, index]));
  for (const node of changes.upsertNodes ?? []) {
    const index = nodeIndexes.get(node.id);
    if (index === undefined) {
      nodeIndexes.set(node.id, nodes.length);
      nodes.push(node);
    } else {
      nodes[index] = node;
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: (E | CanvasEdgeInput)[] = currentEdges.filter(
    (edge) =>
      !deletedEdges.has(edge.id) &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target),
  );
  const edgeIndexes = new Map(edges.map((edge, index) => [edge.id, index]));
  for (const edge of changes.upsertEdges ?? []) {
    const index = edgeIndexes.get(edge.id);
    if (index === undefined) {
      edgeIndexes.set(edge.id, edges.length);
      edges.push(edge);
    } else {
      edges[index] = edge;
    }
  }

  return { nodes, edges };
}
