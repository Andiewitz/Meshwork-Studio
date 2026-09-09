import { db } from "./connection";
import {
  workspaces,
  collections,
  workspaceOutboxEvents,
  type InsertWorkspace,
  type Workspace,
  type Collection,
  type InsertCollection,
} from "./schema";
// TODO(C5): replace this cross-service read with the team internal endpoint.
// Team membership rows are NOT queryable from workspace_db — the shared
// workspace ids arrive via the team service's internal API.
import { fetchSharedWorkspaceIds } from "@services/team/db/ownership-client";
import { eq, desc, and, isNull, or, inArray, sql } from "drizzle-orm";
import type { DrizzleTx } from "@server/lib/events";

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
  ): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
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
  deleteAllUserData(userId: string, tx?: DrizzleTx): Promise<void>;
  /** Atomically deletes a user's workspaces and queues their canvas cleanup. */
  deleteAllUserDataAndEnqueueCleanup(userId: string): Promise<string[]>;
}

export class WorkspaceDatabaseStorage implements IWorkspaceStorage {
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
  ): Promise<Workspace[]> {
    const sharedWorkspaceIds = await fetchSharedWorkspaceIds(userId);

    // 3. Build query: owned workspaces respect collection filter,
    //    shared workspaces always appear at root level (no collection filter)
    const ownedQuery = collectionId
      ? and(
          eq(workspaces.userId, userId),
          eq(workspaces.collectionId, collectionId),
        )
      : and(eq(workspaces.userId, userId), isNull(workspaces.collectionId));

    const fullQuery =
      sharedWorkspaceIds.length > 0 && !collectionId
        ? or(ownedQuery, inArray(workspaces.id, sharedWorkspaceIds))
        : ownedQuery;

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

  async deleteAllUserData(
    userId: string,
    providedTx?: DrizzleTx,
  ): Promise<void> {
    const execute = async (tx: DrizzleTx) => {
      await tx.delete(workspaces).where(eq(workspaces.userId, userId));
      await tx.delete(collections).where(eq(collections.userId, userId));
    };

    if (providedTx) {
      await execute(providedTx);
    } else {
      await db.transaction(execute);
    }
  }

  async deleteAllUserDataAndEnqueueCleanup(userId: string): Promise<string[]> {
    return db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.userId, userId));
      const ids = rows.map((row) => row.id);

      await tx.delete(workspaces).where(eq(workspaces.userId, userId));
      await tx.delete(collections).where(eq(collections.userId, userId));
      await tx.insert(workspaceOutboxEvents).values({
        eventType: "workspaces.deleted",
        payload: { ids },
      });
      return ids;
    });
  }
}

export class WorkspaceInMemoryStorage implements IWorkspaceStorage {
  private collections: Collection[] = [];
  private workspaces: Workspace[] = [];
  private currentCollectionId = 1;

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
      .filter((w) => w.userId === userId && w.collectionId === collectionId)
      .sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      );
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return this.workspaces.find((w) => w.id === id);
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

  async deleteAllUserData(userId: string): Promise<void> {
    this.workspaces = this.workspaces.filter((w) => w.userId !== userId);
    this.collections = this.collections.filter((c) => c.userId !== userId);
  }

  async deleteAllUserDataAndEnqueueCleanup(userId: string): Promise<string[]> {
    const ids = await this.listWorkspaceIdsByOwner(userId);
    await this.deleteAllUserData(userId);
    return ids;
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
