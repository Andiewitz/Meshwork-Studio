import { db } from "./connection";
import {
  workspaces,
  collections,
  workspaceOutboxEvents,
  workspaceCollaborators,
  type InsertWorkspace,
  type Workspace,
  type WorkspaceCollaborator,
  type InsertWorkspaceCollaborator,
  type Collection,
  type InsertCollection,
} from "./schema";
import { eq, desc, and, isNull, or, inArray, sql } from "drizzle-orm";
import type { DrizzleTx } from "@server/lib/db-types";
import type {
  WorkspaceAccess,
  WorkspaceCollaboratorPermission,
} from "@shared/schema/workspace-contract";

export type UserCleanupStatus =
  "pending" | "completed" | "failed" | "not_found";

export interface IWorkspaceStorage {
  // Collections (subcollections/folders)
  getCollections(
    userId: string,
    parentId?: number | null,
  ): Promise<Collection[]>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(
    id: number,
    updates: Partial<InsertCollection>,
  ): Promise<Collection>;
  deleteCollection(id: number): Promise<void>;
  getCollectionById(id: number): Promise<Collection | undefined>;

  // Workspaces
  getWorkspaces(
    userId: string,
    collectionId?: number | null,
    requestId?: string,
  ): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByIds(ids: string[]): Promise<Workspace[]>;
  listWorkspaceCollaborators(
    workspaceId: string,
  ): Promise<WorkspaceCollaborator[]>;
  getWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccess>;
  getWorkspaceAccessVersion?(
    workspaceId: string,
    userId: string,
  ): Promise<{ access: WorkspaceAccess; epoch: string | null }>;

  getWorkspaceAccessBatch(
    workspaceId: string,
    userIds: string[],
  ): Promise<{ userId: string; access: WorkspaceAccess }[]>;
  upsertWorkspaceCollaborator(
    collaborator: InsertWorkspaceCollaborator,
  ): Promise<WorkspaceCollaborator>;
  updateWorkspaceCollaboratorPermission(
    workspaceId: string,
    userId: string,
    permission: WorkspaceCollaboratorPermission,
  ): Promise<WorkspaceCollaborator>;
  removeWorkspaceCollaborator(
    workspaceId: string,
    userId: string,
  ): Promise<void>;
  /** Ids the user personally owns (not team-shared) — deletion choreography. */
  listWorkspaceIdsByOwner(userId: string): Promise<string[]>;
  countWorkspaces(): Promise<number>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(
    id: string,
    updates: Partial<InsertWorkspace>,
  ): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;
  /** Atomically deletes a workspace and queues its canvas cleanup. */
  deleteWorkspaceAndEnqueueCleanup(id: string): Promise<void>;
  duplicateWorkspace(id: string, newTitle?: string): Promise<Workspace>;
  /** Creates a copy in `copying` state and atomically queues its canvas clone. */
  duplicateWorkspaceAndEnqueueCanvasCopy(
    id: string,
    newTitle?: string,
  ): Promise<Workspace>;
  /** Requeues a canvas clone which exhausted its previous retry budget. */
  retryCanvasCopy(id: string): Promise<Workspace>;
  deleteAllUserData(userId: string, tx?: DrizzleTx): Promise<void>;
  /** Atomically deletes a user's workspaces and queues their canvas cleanup. */
  deleteAllUserDataAndEnqueueCleanup(
    userId: string,
    operationId?: string,
  ): Promise<string[]>;
  getUserCleanupStatus(
    userId: string,
    operationId: string,
  ): Promise<UserCleanupStatus>;
}

export class WorkspaceDatabaseStorage implements IWorkspaceStorage {
  private async assertNotWorkspaceOwner(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const [workspace] = await db
      .select({ userId: workspaces.userId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (!workspace) throw new Error("Workspace not found");
    if (workspace.userId === userId) {
      throw new Error("Workspace owner cannot be a collaborator");
    }
  }

  // Collections
  async getCollections(
    userId: string,
    parentId: number | null = null,
  ): Promise<Collection[]> {
    const query = parentId
      ? and(eq(collections.userId, userId), eq(collections.parentId, parentId))
      : and(eq(collections.userId, userId), isNull(collections.parentId));

    return await db.select().from(collections).where(query);
  }

  async getCollectionById(id: number): Promise<Collection | undefined> {
    const [collection] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id));
    return collection;
  }

  async createCollection(
    insertCollection: InsertCollection,
  ): Promise<Collection> {
    const [collection] = await db
      .insert(collections)
      .values(insertCollection)
      .returning();
    return collection;
  }

  async updateCollection(
    id: number,
    updates: Partial<InsertCollection>,
  ): Promise<Collection> {
    const [collection] = await db
      .update(collections)
      .set(updates)
      .where(eq(collections.id, id))
      .returning();
    return collection;
  }

  async deleteCollection(id: number): Promise<void> {
    await db.delete(collections).where(eq(collections.id, id));
  }

  // Workspaces
  async getWorkspaces(
    userId: string,
    collectionId: number | null = null,
    requestId?: string,
  ): Promise<Workspace[]> {
    // 3. Build query: owned workspaces respect collection filter,
    //    shared workspaces always appear at root level (no collection filter)
    const ownedQuery = collectionId
      ? and(
          eq(workspaces.userId, userId),
          eq(workspaces.collectionId, collectionId),
        )
      : and(eq(workspaces.userId, userId), isNull(workspaces.collectionId));

    const directShares = db
      .select({ id: workspaceCollaborators.workspaceId })
      .from(workspaceCollaborators)
      .where(eq(workspaceCollaborators.userId, userId));
    const fullQuery = collectionId
      ? ownedQuery
      : or(ownedQuery, inArray(workspaces.id, directShares));

    return await db
      .select()
      .from(workspaces)
      .where(fullQuery)
      .orderBy(desc(workspaces.createdAt));
  }

  async listWorkspaceIdsByOwner(userId: string): Promise<string[]> {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.userId, userId));
    return rows.map((r) => r.id);
  }

  async countWorkspaces(): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(workspaces);
    return row?.n ?? 0;
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id));
    return workspace;
  }

  async getWorkspacesByIds(ids: string[]): Promise<Workspace[]> {
    if (ids.length === 0) return [];
    return db.select().from(workspaces).where(inArray(workspaces.id, ids));
  }

  async listWorkspaceCollaborators(
    workspaceId: string,
  ): Promise<WorkspaceCollaborator[]> {
    return db
      .select()
      .from(workspaceCollaborators)
      .where(eq(workspaceCollaborators.workspaceId, workspaceId));
  }

  async getWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccess> {
    return (
      (await this.getWorkspaceAccessBatch(workspaceId, [userId]))[0]?.access ??
      "none"
    );
  }

  /** One database snapshot for the access decision and its replay epoch. */
  async getWorkspaceAccessVersion(
    workspaceId: string,
    userId: string,
  ): Promise<{ access: WorkspaceAccess; epoch: string | null }> {
    const result = await db.execute<{
      access: WorkspaceAccess;
      epoch: string | null;
    }>(sql`
      SELECT CASE WHEN w.user_id=${userId} THEN 'owner'
        WHEN c.permission IN ('view','edit') THEN c.permission ELSE 'none' END AS access,
        e.epoch::text AS epoch
      FROM workspaces w
      LEFT JOIN workspace_collaborators c ON c.workspace_id=w.id AND c.user_id=${userId}
      LEFT JOIN workspace_access_epochs e ON e.workspace_id=w.id AND e.user_id=${userId}
      WHERE w.id=${workspaceId}`);
    const row = result.rows[0];
    if (!row || row.access === "none") return { access: "none", epoch: null };
    if (!row.epoch) throw new Error("Workspace access epoch unavailable");
    return { access: row.access, epoch: row.epoch };
  }

  async getWorkspaceAccessBatch(
    workspaceId: string,
    userIds: string[],
  ): Promise<{ userId: string; access: WorkspaceAccess }[]> {
    const unique = [...new Set(userIds)];
    const result = new Map<string, WorkspaceAccess>(
      unique.map((userId) => [userId, "none"]),
    );
    // Bound each SQL IN list; all results still come from Workspace's database.
    for (let offset = 0; offset < unique.length; offset += 500) {
      const batch = unique.slice(offset, offset + 500);
      const rows = await db
        .select({
          ownerId: workspaces.userId,
          collaboratorId: workspaceCollaborators.userId,
          permission: workspaceCollaborators.permission,
        })
        .from(workspaces)
        .leftJoin(
          workspaceCollaborators,
          and(
            eq(workspaceCollaborators.workspaceId, workspaces.id),
            inArray(workspaceCollaborators.userId, batch),
          ),
        )
        .where(eq(workspaces.id, workspaceId));
      for (const row of rows) {
        if (row.ownerId && result.has(row.ownerId))
          result.set(row.ownerId, "owner");
        if (
          row.collaboratorId &&
          row.collaboratorId !== row.ownerId &&
          row.permission
        )
          result.set(row.collaboratorId, row.permission);
      }
    }
    return [...result].map(([userId, access]) => ({ userId, access }));
  }

  async upsertWorkspaceCollaborator(
    collaborator: InsertWorkspaceCollaborator,
  ): Promise<WorkspaceCollaborator> {
    await this.assertNotWorkspaceOwner(
      collaborator.workspaceId,
      collaborator.userId,
    );
    const [saved] = await db
      .insert(workspaceCollaborators)
      .values(collaborator)
      .onConflictDoUpdate({
        target: [
          workspaceCollaborators.workspaceId,
          workspaceCollaborators.userId,
        ],
        set: {
          permission: collaborator.permission,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async updateWorkspaceCollaboratorPermission(
    workspaceId: string,
    userId: string,
    permission: WorkspaceCollaboratorPermission,
  ): Promise<WorkspaceCollaborator> {
    await this.assertNotWorkspaceOwner(workspaceId, userId);
    const [updated] = await db
      .update(workspaceCollaborators)
      .set({ permission, updatedAt: new Date() })
      .where(
        and(
          eq(workspaceCollaborators.workspaceId, workspaceId),
          eq(workspaceCollaborators.userId, userId),
        ),
      )
      .returning();
    if (!updated) throw new Error("Workspace collaborator not found");
    return updated;
  }

  async removeWorkspaceCollaborator(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await this.assertNotWorkspaceOwner(workspaceId, userId);
    await db
      .delete(workspaceCollaborators)
      .where(
        and(
          eq(workspaceCollaborators.workspaceId, workspaceId),
          eq(workspaceCollaborators.userId, userId),
        ),
      );
  }

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
    const [workspace] = await db
      .insert(workspaces)
      .values(insertWorkspace)
      .returning();
    return workspace;
  }

  async updateWorkspace(
    id: string,
    updates: Partial<InsertWorkspace>,
  ): Promise<Workspace> {
    const [workspace] = await db
      .update(workspaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  async deleteWorkspaceAndEnqueueCleanup(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(workspaces).where(eq(workspaces.id, id));
      await tx.insert(workspaceOutboxEvents).values({
        eventType: "workspace.deleted",
        payload: { id },
      });
    });
  }

  async duplicateWorkspace(id: string, newTitle?: string): Promise<Workspace> {
    const existing = await this.getWorkspace(id);
    if (!existing) throw new Error("Workspace not found");

    const [duplicated] = await db
      .insert(workspaces)
      .values({
        title: newTitle || `${existing.title} (Copy)`,
        type: existing.type,
        icon: existing.icon,
        userId: existing.userId,
        collectionId: existing.collectionId,
        description: existing.description,
        author: existing.author,
        aiContext: existing.aiContext,
        groups: existing.groups || [],
        tags: existing.tags || [],
      })
      .returning();

    return duplicated;
  }

  async duplicateWorkspaceAndEnqueueCanvasCopy(
    id: string,
    newTitle?: string,
  ): Promise<Workspace> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id));
      if (!existing) throw new Error("Workspace not found");

      const [duplicated] = await tx
        .insert(workspaces)
        .values({
          title: newTitle || `${existing.title} (Copy)`,
          type: existing.type,
          icon: existing.icon,
          userId: existing.userId,
          collectionId: existing.collectionId,
          description: existing.description,
          author: existing.author,
          aiContext: existing.aiContext,
          groups: existing.groups || [],
          tags: existing.tags || [],
          canvasCopyStatus: "copying",
          canvasCopySourceId: id,
        })
        .returning();

      await tx.insert(workspaceOutboxEvents).values({
        eventType: "workspace.duplicated",
        payload: { originalId: id, newId: duplicated.id },
      });
      return duplicated;
    });
  }

  async retryCanvasCopy(id: string): Promise<Workspace> {
    return db.transaction(async (tx) => {
      const [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id));
      if (!workspace) throw new Error("Workspace not found");
      if (workspace.canvasCopyStatus !== "failed") {
        throw new Error("Canvas copy is not eligible for retry");
      }
      if (!workspace.canvasCopySourceId) {
        throw new Error("Canvas copy source is unavailable");
      }

      const [retrying] = await tx
        .update(workspaces)
        .set({ canvasCopyStatus: "copying", updatedAt: new Date() })
        .where(eq(workspaces.id, id))
        .returning();
      await tx.insert(workspaceOutboxEvents).values({
        eventType: "workspace.duplicated",
        payload: { originalId: workspace.canvasCopySourceId, newId: id },
      });
      return retrying;
    });
  }

  async deleteAllUserData(
    userId: string,
    providedTx?: DrizzleTx,
  ): Promise<void> {
    const execute = async (tx: DrizzleTx) => {
      // Users live in auth_db, so remove grants to a deleted user explicitly.
      // The workspace FK only cascades grants for workspaces the user owns.
      await tx
        .delete(workspaceCollaborators)
        .where(eq(workspaceCollaborators.userId, userId));
      await tx.delete(workspaces).where(eq(workspaces.userId, userId));
      await tx.delete(collections).where(eq(collections.userId, userId));
    };

    if (providedTx) {
      await execute(providedTx);
    } else {
      await db.transaction(execute);
    }
  }

  async getUserCleanupStatus(
    userId: string,
    operationId: string,
  ): Promise<UserCleanupStatus> {
    if (!isCleanupOperationId(operationId))
      throw new Error("Invalid cleanup operation ID");
    const [event] = await db
      .select({
        eventType: workspaceOutboxEvents.eventType,
        payload: workspaceOutboxEvents.payload,
        processedAt: workspaceOutboxEvents.processedAt,
        deadLetteredAt: workspaceOutboxEvents.deadLetteredAt,
      })
      .from(workspaceOutboxEvents)
      .where(eq(workspaceOutboxEvents.id, operationId.toLowerCase()));
    const payload = event?.payload as { userId?: unknown } | undefined;
    if (
      !event ||
      event.eventType !== "workspaces.deleted" ||
      payload?.userId !== userId
    )
      return "not_found";
    if (event.processedAt) return "completed";
    if (event.deadLetteredAt) return "failed";
    return "pending";
  }

  async deleteAllUserDataAndEnqueueCleanup(
    userId: string,
    operationId?: string,
  ): Promise<string[]> {
    if (operationId !== undefined && !isCleanupOperationId(operationId))
      throw new Error("Invalid cleanup operation ID");
    operationId = operationId?.toLowerCase();
    return db.transaction(async (tx) => {
      if (operationId) {
        // Serialize concurrent retries before checking whether the operation exists.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${"identity-cleanup:" + operationId}, 0))`,
        );
        const [existing] = await tx
          .select({
            eventType: workspaceOutboxEvents.eventType,
            payload: workspaceOutboxEvents.payload,
          })
          .from(workspaceOutboxEvents)
          .where(eq(workspaceOutboxEvents.id, operationId));
        if (existing) {
          const payload = existing.payload as {
            userId?: unknown;
            ids?: unknown;
          };
          if (
            existing.eventType !== "workspaces.deleted" ||
            payload?.userId !== userId ||
            !Array.isArray(payload.ids) ||
            !payload.ids.every((id) => typeof id === "string")
          ) {
            throw new Error("Cleanup operation ID is already in use");
          }
          return payload.ids;
        }
      }
      const rows = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.userId, userId));
      const ids = rows.map((row) => row.id);

      await tx
        .delete(workspaceCollaborators)
        .where(eq(workspaceCollaborators.userId, userId));
      await tx.delete(workspaces).where(eq(workspaces.userId, userId));
      await tx.delete(collections).where(eq(collections.userId, userId));
      await tx.insert(workspaceOutboxEvents).values({
        ...(operationId ? { id: operationId } : {}),
        eventType: "workspaces.deleted",
        payload: operationId ? { ids, userId } : { ids },
      });
      return ids;
    });
  }
}

function isCleanupOperationId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export class WorkspaceInMemoryStorage implements IWorkspaceStorage {
  private cleanupOperations = new Map<
    string,
    { userId: string; result: Promise<string[]> }
  >();
  private collections: Collection[] = [];
  private workspaces: Workspace[] = [];
  private workspaceCollaborators: WorkspaceCollaborator[] = [];
  private currentCollectionId = 1;

  private assertNotWorkspaceOwner(workspaceId: string, userId: string): void {
    const workspace = this.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    if (workspace.userId === userId) {
      throw new Error("Workspace owner cannot be a collaborator");
    }
  }

  async getCollections(
    userId: string,
    parentId: number | null = null,
  ): Promise<Collection[]> {
    return this.collections.filter(
      (c) => c.userId === userId && c.parentId === parentId,
    );
  }

  async getCollectionById(id: number): Promise<Collection | undefined> {
    return this.collections.find((c) => c.id === id);
  }

  async createCollection(
    insertCollection: InsertCollection,
  ): Promise<Collection> {
    const col: Collection = {
      id: this.currentCollectionId++,
      title: insertCollection.title,
      description: insertCollection.description ?? null,
      userId: insertCollection.userId ?? null,
      parentId: insertCollection.parentId ?? null,
      createdAt: new Date(),
    };
    this.collections.push(col);
    return col;
  }

  async updateCollection(
    id: number,
    updates: Partial<InsertCollection>,
  ): Promise<Collection> {
    const index = this.collections.findIndex((c) => c.id === id);
    if (index === -1) throw new Error("Collection not found");
    const updated = {
      ...this.collections[index],
      ...updates,
    };
    this.collections[index] = updated;
    return updated;
  }

  async deleteCollection(id: number): Promise<void> {
    this.collections = this.collections.filter((c) => c.id !== id);
  }

  async getWorkspaces(
    userId: string,
    collectionId: number | null = null,
  ): Promise<Workspace[]> {
    return this.workspaces
      .filter(
        (w) =>
          (w.userId === userId && w.collectionId === collectionId) ||
          (collectionId === null &&
            this.workspaceCollaborators.some(
              (c) => c.userId === userId && c.workspaceId === w.id,
            )),
      )
      .sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      );
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return this.workspaces.find((w) => w.id === id);
  }

  async getWorkspacesByIds(ids: string[]): Promise<Workspace[]> {
    const wanted = new Set(ids);
    return this.workspaces.filter((workspace) => wanted.has(workspace.id));
  }

  async listWorkspaceCollaborators(
    workspaceId: string,
  ): Promise<WorkspaceCollaborator[]> {
    return this.workspaceCollaborators.filter(
      (collaborator) => collaborator.workspaceId === workspaceId,
    );
  }

  async getWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccess> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) return "none";
    if (workspace.userId === userId) return "owner";
    return (
      this.workspaceCollaborators.find(
        (collaborator) =>
          collaborator.workspaceId === workspaceId &&
          collaborator.userId === userId,
      )?.permission ?? "none"
    );
  }

  async getWorkspaceAccessBatch(
    workspaceId: string,
    userIds: string[],
  ): Promise<{ userId: string; access: WorkspaceAccess }[]> {
    const result = new Map<string, WorkspaceAccess>();
    for (const userId of new Set(userIds))
      result.set(userId, await this.getWorkspaceAccess(workspaceId, userId));
    return [...result].map(([userId, access]) => ({ userId, access }));
  }

  async upsertWorkspaceCollaborator(
    collaborator: InsertWorkspaceCollaborator,
  ): Promise<WorkspaceCollaborator> {
    this.assertNotWorkspaceOwner(collaborator.workspaceId, collaborator.userId);
    const index = this.workspaceCollaborators.findIndex(
      (item) =>
        item.workspaceId === collaborator.workspaceId &&
        item.userId === collaborator.userId,
    );
    const now = new Date();
    if (index >= 0) {
      const updated = {
        ...this.workspaceCollaborators[index],
        permission: collaborator.permission,
        updatedAt: now,
      };
      this.workspaceCollaborators[index] = updated;
      return updated;
    }

    const created: WorkspaceCollaborator = {
      ...collaborator,
      createdAt: now,
      updatedAt: now,
    };
    this.workspaceCollaborators.push(created);
    return created;
  }

  async updateWorkspaceCollaboratorPermission(
    workspaceId: string,
    userId: string,
    permission: WorkspaceCollaboratorPermission,
  ): Promise<WorkspaceCollaborator> {
    this.assertNotWorkspaceOwner(workspaceId, userId);
    const index = this.workspaceCollaborators.findIndex(
      (item) => item.workspaceId === workspaceId && item.userId === userId,
    );
    if (index === -1) throw new Error("Workspace collaborator not found");
    const updated = {
      ...this.workspaceCollaborators[index],
      permission,
      updatedAt: new Date(),
    };
    this.workspaceCollaborators[index] = updated;
    return updated;
  }

  async removeWorkspaceCollaborator(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    this.assertNotWorkspaceOwner(workspaceId, userId);
    this.workspaceCollaborators = this.workspaceCollaborators.filter(
      (item) => item.workspaceId !== workspaceId || item.userId !== userId,
    );
  }

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
    const ws: Workspace = {
      id: crypto.randomUUID(),
      title: insertWorkspace.title,
      type: insertWorkspace.type ?? "system",
      icon: insertWorkspace.icon ?? "box",
      isFavorite: insertWorkspace.isFavorite ?? false,
      userId: insertWorkspace.userId ?? null,
      collectionId: insertWorkspace.collectionId ?? null,
      description: insertWorkspace.description ?? null,
      author: insertWorkspace.author ?? null,
      aiContext: insertWorkspace.aiContext ?? null,
      groups: insertWorkspace.groups ?? [],
      tags: insertWorkspace.tags ?? [],
      canvasCopyStatus: "ready",
      canvasCopySourceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.workspaces.push(ws);
    return ws;
  }

  async updateWorkspace(
    id: string,
    updates: Partial<InsertWorkspace>,
  ): Promise<Workspace> {
    const index = this.workspaces.findIndex((w) => w.id === id);
    if (index === -1) throw new Error("Workspace not found");
    const updated = {
      ...this.workspaces[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.workspaces[index] = updated;
    return updated;
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.workspaces = this.workspaces.filter((w) => w.id !== id);
    this.workspaceCollaborators = this.workspaceCollaborators.filter(
      (collaborator) => collaborator.workspaceId !== id,
    );
  }

  async deleteWorkspaceAndEnqueueCleanup(id: string): Promise<void> {
    await this.deleteWorkspace(id);
  }

  async duplicateWorkspace(id: string, newTitle?: string): Promise<Workspace> {
    const existing = await this.getWorkspace(id);
    if (!existing) throw new Error("Workspace not found");
    return this.createWorkspace({
      title: newTitle || `${existing.title} (Copy)`,
      type: existing.type,
      icon: existing.icon,
      userId: existing.userId,
      collectionId: existing.collectionId,
      description: existing.description,
      author: existing.author,
      aiContext: existing.aiContext,
      groups: existing.groups ?? [],
      tags: existing.tags ?? [],
    });
  }

  async duplicateWorkspaceAndEnqueueCanvasCopy(
    id: string,
    newTitle?: string,
  ): Promise<Workspace> {
    const existing = await this.getWorkspace(id);
    if (!existing) throw new Error("Workspace not found");
    const copied = await this.createWorkspace({
      title: newTitle || `${existing.title} (Copy)`,
      type: existing.type,
      icon: existing.icon,
      userId: existing.userId,
      collectionId: existing.collectionId,
      description: existing.description,
      author: existing.author,
      aiContext: existing.aiContext,
      groups: existing.groups ?? [],
      tags: existing.tags ?? [],
    });
    const copiedIndex = this.workspaces.findIndex(
      (workspace) => workspace.id === copied.id,
    );
    const copying = {
      ...copied,
      canvasCopyStatus: "copying" as const,
      canvasCopySourceId: id,
    };
    this.workspaces[copiedIndex] = copying;
    return copying;
  }

  async retryCanvasCopy(id: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(id);
    if (!workspace) throw new Error("Workspace not found");
    if (workspace.canvasCopyStatus !== "failed") {
      throw new Error("Canvas copy is not eligible for retry");
    }
    const index = this.workspaces.findIndex((candidate) => candidate.id === id);
    const updated = {
      ...workspace,
      canvasCopyStatus: "copying" as const,
      updatedAt: new Date(),
    };
    this.workspaces[index] = updated;
    return updated;
  }

  async deleteAllUserData(userId: string): Promise<void> {
    const workspaceIds = new Set(
      this.workspaces
        .filter((workspace) => workspace.userId === userId)
        .map((workspace) => workspace.id),
    );
    this.workspaces = this.workspaces.filter((w) => w.userId !== userId);
    this.workspaceCollaborators = this.workspaceCollaborators.filter(
      (collaborator) =>
        !workspaceIds.has(collaborator.workspaceId) &&
        collaborator.userId !== userId,
    );
    this.collections = this.collections.filter((c) => c.userId !== userId);
  }

  async getUserCleanupStatus(
    userId: string,
    operationId: string,
  ): Promise<UserCleanupStatus> {
    if (!isCleanupOperationId(operationId))
      throw new Error("Invalid cleanup operation ID");
    const operation = this.cleanupOperations.get(operationId.toLowerCase());
    return operation?.userId === userId ? "pending" : "not_found";
  }

  async deleteAllUserDataAndEnqueueCleanup(
    userId: string,
    operationId?: string,
  ): Promise<string[]> {
    if (operationId !== undefined && !isCleanupOperationId(operationId))
      throw new Error("Invalid cleanup operation ID");
    operationId = operationId?.toLowerCase();
    const previous = operationId
      ? this.cleanupOperations.get(operationId)
      : undefined;
    if (previous) {
      if (previous.userId !== userId)
        throw new Error("Cleanup operation ID is already in use");
      return [...(await previous.result)];
    }
    const result = (async () => {
      const ids = await this.listWorkspaceIdsByOwner(userId);
      await this.deleteAllUserData(userId);
      return ids;
    })();
    if (operationId)
      this.cleanupOperations.set(operationId, { userId, result });
    try {
      return [...(await result)];
    } catch (err) {
      if (operationId) this.cleanupOperations.delete(operationId);
      throw err;
    }
  }

  async listWorkspaceIdsByOwner(userId: string): Promise<string[]> {
    return this.workspaces.filter((w) => w.userId === userId).map((w) => w.id);
  }

  async countWorkspaces(): Promise<number> {
    return this.workspaces.length;
  }
}

// SECURITY: storage backend selection must never depend on an auth bypass
// flag. In-memory storage is reserved for unit tests that construct it
// explicitly.
export const workspaceStorage: IWorkspaceStorage =
  new WorkspaceDatabaseStorage();
