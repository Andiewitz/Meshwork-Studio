import { db } from "./connection";
import {
  nodes,
  edges,
  type Node,
  type Edge,
  type InsertNode,
  type InsertEdge,
} from "./schema";
import { workspaces } from "@services/workspace/db/schema";
import { eq, inArray, sql, and } from "drizzle-orm";
import type { DrizzleTx } from "@server/lib/events";

export interface ICanvasStorage {
  // Canvas operations
  getNodes(workspaceId: number): Promise<Node[]>;
  getEdges(workspaceId: number): Promise<Edge[]>;
  syncCanvas(
    workspaceId: number,
    nodes: InsertNode[],
    edges: InsertEdge[],
  ): Promise<void>;
  duplicateCanvas(
    fromWorkspaceId: number,
    toWorkspaceId: number,
  ): Promise<void>;
  deleteAllUserData(userId: string, tx?: DrizzleTx): Promise<void>;
}

export class CanvasDatabaseStorage implements ICanvasStorage {
  async getNodes(workspaceId: number): Promise<Node[]> {
    return await db
      .select()
      .from(nodes)
      .where(eq(nodes.workspaceId, workspaceId));
  }

  async getEdges(workspaceId: number): Promise<Edge[]> {
    return await db
      .select()
      .from(edges)
      .where(eq(edges.workspaceId, workspaceId));
  }

  async syncCanvas(
    workspaceId: number,
    newNodes: InsertNode[],
    newEdges: InsertEdge[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Fetch existing IDs
      const existingNodesData = await tx
        .select({ id: nodes.id })
        .from(nodes)
        .where(eq(nodes.workspaceId, workspaceId));
      const existingEdgesData = await tx
        .select({ id: edges.id })
        .from(edges)
        .where(eq(edges.workspaceId, workspaceId));

      const existingNodeIds = new Set<string>(
        existingNodesData.map((n) => n.id),
      );
      const existingEdgeIds = new Set<string>(
        existingEdgesData.map((e) => e.id),
      );

      const newNodeIds = new Set<string>(newNodes.map((n) => n.id));
      const newEdgeIds = new Set<string>(newEdges.map((e) => e.id));

      // 2. Identify stale nodes and edges to prune
      const nodesToDelete = Array.from(existingNodeIds).filter(
        (id) => !newNodeIds.has(id),
      );
      const edgesToDelete = Array.from(existingEdgeIds).filter(
        (id) => !newEdgeIds.has(id),
      );

      // 3. Delete orphaned entities explicitly
      if (edgesToDelete.length > 0) {
        await tx
          .delete(edges)
          .where(
            and(
              eq(edges.workspaceId, workspaceId),
              inArray(edges.id, edgesToDelete),
            ),
          );
      }
      if (nodesToDelete.length > 0) {
        await tx
          .delete(nodes)
          .where(
            and(
              eq(nodes.workspaceId, workspaceId),
              inArray(nodes.id, nodesToDelete),
            ),
          );
      }

      // 4. Safely Upsert in Chunks
      const CHUNK_SIZE = 500;

      if (newNodes.length > 0) {
        for (let i = 0; i < newNodes.length; i += CHUNK_SIZE) {
          const chunk = newNodes.slice(i, i + CHUNK_SIZE);
          await tx
            .insert(nodes)
            .values(chunk.map((n) => ({ ...n, workspaceId })))
            .onConflictDoUpdate({
              target: [nodes.id, nodes.workspaceId],
              set: {
                type: sql`EXCLUDED.type`,
                position: sql`EXCLUDED.position`,
                data: sql`EXCLUDED.data`,
                parentId: sql`EXCLUDED.parent_id`,
                extent: sql`EXCLUDED.extent`,
                style: sql`EXCLUDED.style`,
                width: sql`EXCLUDED.width`,
                height: sql`EXCLUDED.height`,
                measured: sql`EXCLUDED.measured`,
              },
            });
        }
      }

      if (newEdges.length > 0) {
        for (let i = 0; i < newEdges.length; i += CHUNK_SIZE) {
          const chunk = newEdges.slice(i, i + CHUNK_SIZE);
          await tx
            .insert(edges)
            .values(chunk.map((e) => ({ ...e, workspaceId })))
            .onConflictDoUpdate({
              target: [edges.id, edges.workspaceId],
              set: {
                source: sql`EXCLUDED.source`,
                target: sql`EXCLUDED.target`,
                sourceHandle: sql`EXCLUDED.source_handle`,
                targetHandle: sql`EXCLUDED.target_handle`,
                type: sql`EXCLUDED.type`,
                data: sql`EXCLUDED.data`,
                style: sql`EXCLUDED.style`,
                markerEnd: sql`EXCLUDED.marker_end`,
                animated: sql`EXCLUDED.animated`,
              },
            });
        }
      }

      // 5. Update workspace updated_at timestamp
      await tx
        .update(workspaces)
        .set({ updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));
    });
  }

  async duplicateCanvas(
    fromWorkspaceId: number,
    toWorkspaceId: number,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const nodesList = await tx
        .select()
        .from(nodes)
        .where(eq(nodes.workspaceId, fromWorkspaceId));
      const edgesList = await tx
        .select()
        .from(edges)
        .where(eq(edges.workspaceId, fromWorkspaceId));

      const CHUNK_SIZE = 500;
      if (nodesList.length > 0) {
        for (let i = 0; i < nodesList.length; i += CHUNK_SIZE) {
          const chunk = nodesList.slice(i, i + CHUNK_SIZE);
          await tx
            .insert(nodes)
            .values(chunk.map((n) => ({ ...n, workspaceId: toWorkspaceId })));
        }
      }
      if (edgesList.length > 0) {
        for (let i = 0; i < edgesList.length; i += CHUNK_SIZE) {
          const chunk = edgesList.slice(i, i + CHUNK_SIZE);
          await tx
            .insert(edges)
            .values(chunk.map((e) => ({ ...e, workspaceId: toWorkspaceId })));
        }
      }
    });
  }

  async deleteAllUserData(
    userId: string,
    providedTx?: DrizzleTx,
  ): Promise<void> {
    const execute = async (tx: DrizzleTx) => {
      const userWorkspaces = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.userId, userId));

      const workspaceIds = userWorkspaces.map((w) => w.id);
      if (workspaceIds.length > 0) {
        await tx.delete(edges).where(inArray(edges.workspaceId, workspaceIds));
        await tx.delete(nodes).where(inArray(nodes.workspaceId, workspaceIds));
      }
    };

    if (providedTx) {
      await execute(providedTx);
    } else {
      await db.transaction(execute);
    }
  }
}

// In-memory fallback for Canvas
export class CanvasMemStorage implements ICanvasStorage {
  private nodesMap = new Map<string, Node>();
  private edgesMap = new Map<string, Edge>();

  getNodes(workspaceId: number): Promise<Node[]> {
    return Promise.resolve(
      Array.from(this.nodesMap.values()).filter(
        (n) => n.workspaceId === workspaceId,
      ),
    );
  }

  getEdges(workspaceId: number): Promise<Edge[]> {
    return Promise.resolve(
      Array.from(this.edgesMap.values()).filter(
        (e) => e.workspaceId === workspaceId,
      ),
    );
  }

  syncCanvas(
    workspaceId: number,
    newNodes: InsertNode[],
    newEdges: InsertEdge[],
  ): Promise<void> {
    for (const [id, node] of Array.from(this.nodesMap.entries())) {
      if (node.workspaceId === workspaceId) this.nodesMap.delete(id);
    }
    for (const [id, edge] of Array.from(this.edgesMap.entries())) {
      if (edge.workspaceId === workspaceId) this.edgesMap.delete(id);
    }
    for (const n of newNodes) {
      this.nodesMap.set(`${workspaceId}:${n.id}`, {
        ...n,
        workspaceId,
      } as Node);
    }
    for (const e of newEdges) {
      this.edgesMap.set(`${workspaceId}:${e.id}`, {
        ...e,
        workspaceId,
      } as Edge);
    }
    return Promise.resolve();
  }

  duplicateCanvas(
    fromWorkspaceId: number,
    toWorkspaceId: number,
  ): Promise<void> {
    const nodesToDuplicate = Array.from(this.nodesMap.values()).filter(
      (n) => n.workspaceId === fromWorkspaceId,
    );
    const edgesToDuplicate = Array.from(this.edgesMap.values()).filter(
      (e) => e.workspaceId === fromWorkspaceId,
    );

    for (const node of nodesToDuplicate) {
      this.nodesMap.set(`${toWorkspaceId}:${node.id}`, {
        ...node,
        workspaceId: toWorkspaceId,
      });
    }
    for (const edge of edgesToDuplicate) {
      this.edgesMap.set(`${toWorkspaceId}:${edge.id}`, {
        ...edge,
        workspaceId: toWorkspaceId,
      });
    }
    return Promise.resolve();
  }

  deleteAllUserData(_userId: string): Promise<void> {
    return Promise.resolve();
  }
}

export const canvasStorage: ICanvasStorage =
  process.env.CANVAS_DATABASE_URL || process.env.DATABASE_URL
    ? new CanvasDatabaseStorage()
    : new CanvasMemStorage();
