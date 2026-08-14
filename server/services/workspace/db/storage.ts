import { db } from "./connection";
import {
  workspaces,
  collections,
  type InsertWorkspace,
  type Workspace,
  type Collection,
  type InsertCollection,
} from "./schema";
import { teamMembers, teamWorkspaces } from "@shared/schema";
import { eq, desc, and, isNull, or, inArray } from "drizzle-orm";
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
  getWorkspace(id: number): Promise<Workspace | undefined>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(
    id: number,
    updates: Partial<InsertWorkspace>,
  ): Promise<Workspace>;
  deleteWorkspace(id: number): Promise<void>;
  duplicateWorkspace(id: number, newTitle?: string): Promise<Workspace>;
  deleteAllUserData(userId: string, tx?: DrizzleTx): Promise<void>;
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
    // 1. Get teams the user is in
    const memberships = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));

    const teamIds = memberships.map((m) => m.teamId);

    // 2. Get workspaces shared with those teams
    let sharedWorkspaceIds: number[] = [];
    if (teamIds.length > 0) {
      const shared = await db
        .select({ workspaceId: teamWorkspaces.workspaceId })
        .from(teamWorkspaces)
        .where(inArray(teamWorkspaces.teamId, teamIds));
      sharedWorkspaceIds = shared.map((s) => s.workspaceId);
    }

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

  async getWorkspace(id: number): Promise<Workspace | undefined> {
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
    id: number,
    updates: Partial<InsertWorkspace>,
  ): Promise<Workspace> {
    const [workspace] = await db
      .update(workspaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return workspace;
  }

  async deleteWorkspace(id: number): Promise<void> {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  async duplicateWorkspace(id: number, newTitle?: string): Promise<Workspace> {
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
}

export class WorkspaceInMemoryStorage implements IWorkspaceStorage {
  private collections: Collection[] = [];
  private workspaces: Workspace[] = [];
  private currentCollectionId = 1;
  private currentWorkspaceId = 1;

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

  async getWorkspace(id: number): Promise<Workspace | undefined> {
    return this.workspaces.find((w) => w.id === id);
  }

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
    const ws: Workspace = {
      id: this.currentWorkspaceId++,
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
    id: number,
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

  async deleteWorkspace(id: number): Promise<void> {
    this.workspaces = this.workspaces.filter((w) => w.id !== id);
  }

  async duplicateWorkspace(id: number, newTitle?: string): Promise<Workspace> {
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
      groups: existing.groups || [],
      tags: existing.tags || [],
    });
  }

  async deleteAllUserData(userId: string): Promise<void> {
    this.workspaces = this.workspaces.filter((w) => w.userId !== userId);
    this.collections = this.collections.filter((c) => c.userId !== userId);
  }
}

export const workspaceStorage: IWorkspaceStorage =
  process.env.E2E_BYPASS_AUTH === "true"
    ? new WorkspaceInMemoryStorage()
    : new WorkspaceDatabaseStorage();
