import { eq, and, desc } from "drizzle-orm";
import { db } from "./connection";
import { userApiKeys, type UserApiKey } from "./schema";
import { encryptApiKey, decryptApiKey, generateKeyHint } from "../encryption";
import type { DrizzleTx } from "@server/lib/db-types";

export interface CreateKeyInput {
  userId: string;
  provider: string;
  apiKey: string;
}

export interface KeyWithPlaintext extends UserApiKey {
  plaintextKey: string;
}

/**
 * Create a new encrypted API key for a user
 */
export async function createApiKey(input: CreateKeyInput): Promise<UserApiKey> {
  const { encryptedData, iv, authTag } = encryptApiKey(input.apiKey);
  const keyHint = generateKeyHint(input.apiKey);

  return await db.transaction(async (tx) => {
    await tx
      .update(userApiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(userApiKeys.userId, input.userId),
          eq(userApiKeys.provider, input.provider),
          eq(userApiKeys.isActive, true),
        ),
      );

    const [result] = await tx
      .insert(userApiKeys)
      .values({
        userId: input.userId,
        provider: input.provider,
        encryptedKey: encryptedData,
        iv,
        authTag,
        keyHint,
        isActive: true,
      })
      .returning();

    return result;
  });
}

/**
 * Get all API keys for a user (without plaintext - safe for UI)
 */
export async function getUserApiKeys(userId: string): Promise<UserApiKey[]> {
  return await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .orderBy(userApiKeys.createdAt);
}

/**
 * Get active API keys for a user by provider
 */
export async function getActiveKeyForProvider(
  userId: string,
  provider: string,
): Promise<UserApiKey | null> {
  const [result] = await db
    .select()
    .from(userApiKeys)
    .where(
      and(
        eq(userApiKeys.userId, userId),
        eq(userApiKeys.provider, provider),
        eq(userApiKeys.isActive, true),
      ),
    )
    .orderBy(desc(userApiKeys.createdAt))
    .limit(1);

  return result || null;
}

/**
 * Get a specific API key with decrypted plaintext
 */
export async function getApiKeyWithPlaintext(
  userId: string,
  keyId: string,
): Promise<KeyWithPlaintext | null> {
  const [result] = await db
    .select()
    .from(userApiKeys)
    .where(and(eq(userApiKeys.id, keyId), eq(userApiKeys.userId, userId)))
    .limit(1);

  if (!result) {
    return null;
  }

  const plaintextKey = decryptApiKey(
    result.encryptedKey,
    result.iv,
    result.authTag,
  );

  return {
    ...result,
    plaintextKey,
  };
}

/**
 * Delete an API key
 */
export async function deleteApiKey(
  userId: string,
  keyId: string,
): Promise<boolean> {
  const result = await db
    .delete(userApiKeys)
    .where(and(eq(userApiKeys.id, keyId), eq(userApiKeys.userId, userId)))
    .returning();

  return result.length > 0;
}

/**
 * Toggle key active status
 */
export async function toggleKeyStatus(
  userId: string,
  keyId: string,
  isActive: boolean,
): Promise<UserApiKey | null> {
  const [result] = await db
    .update(userApiKeys)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(userApiKeys.id, keyId), eq(userApiKeys.userId, userId)))
    .returning();

  return result || null;
}

/**
 * Check if user has any keys for a provider
 */
export async function hasKeyForProvider(
  userId: string,
  provider: string,
): Promise<boolean> {
  const result = await db
    .select({ count: userApiKeys.id })
    .from(userApiKeys)
    .where(
      and(
        eq(userApiKeys.userId, userId),
        eq(userApiKeys.provider, provider),
        eq(userApiKeys.isActive, true),
      ),
    )
    .limit(1);

  return result.length > 0;
}

// ─── Conversations ────────────────────────────────────────────────────────────

import {
  conversations,
  messages,
  memories,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Memory,
  type InsertMemory,
} from "./schema";
import { ilike, or, inArray, asc } from "drizzle-orm";

export async function createConversation(
  input: InsertConversation,
): Promise<Conversation> {
  const [conversation] = await db
    .insert(conversations)
    .values(input)
    .returning();
  return conversation;
}

export async function getConversations(
  userId: string,
  filter?: { workspaceId?: string | null; scope?: string },
): Promise<Conversation[]> {
  const conditions = [eq(conversations.userId, userId)];

  if (filter?.workspaceId !== undefined) {
    if (filter.workspaceId === null) {
      // global / non-workspace
      conditions.push(eq(conversations.scope, "global"));
    } else {
      conditions.push(eq(conversations.workspaceId, filter.workspaceId));
    }
  }

  if (filter?.scope) {
    conditions.push(eq(conversations.scope, filter.scope));
  }

  return await db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversationById(
  id: string,
  userId: string,
): Promise<Conversation | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  return conversation || null;
}

export async function updateConversation(
  id: string,
  userId: string,
  updates: Partial<InsertConversation>,
): Promise<Conversation | null> {
  const [updated] = await db
    .update(conversations)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning();
  return updated || null;
}

export async function deleteConversation(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning();
  return result.length > 0;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function createMessage(input: InsertMessage): Promise<Message> {
  const [message] = await db.insert(messages).values(input).returning();

  // touch conversation updatedAt
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));

  return message;
}

export async function getMessagesByConversationId(
  conversationId: string,
  limit = 100,
): Promise<Message[]> {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(limit);
}

// ─── Memories ─────────────────────────────────────────────────────────────────

export async function createMemory(input: InsertMemory): Promise<Memory> {
  const [memory] = await db.insert(memories).values(input).returning();
  return memory;
}

export async function getMemories(
  userId: string,
  filter?: {
    workspaceId?: string | null;
    scope?: string;
    category?: string;
    limit?: number;
  },
): Promise<Memory[]> {
  const conditions = [eq(memories.userId, userId)];

  if (filter?.workspaceId) {
    conditions.push(
      or(
        eq(memories.workspaceId, filter.workspaceId),
        eq(memories.scope, "global"),
      )!,
    );
  }

  if (filter?.scope) {
    conditions.push(eq(memories.scope, filter.scope));
  }

  if (filter?.category) {
    conditions.push(eq(memories.category, filter.category));
  }

  return await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.updatedAt))
    .limit(filter?.limit ?? 50);
}

export async function searchMemories(
  userId: string,
  query: string,
  filter?: { workspaceId?: string | null; limit?: number },
): Promise<Memory[]> {
  const searchPattern = `%${query}%`;
  const conditions = [
    eq(memories.userId, userId),
    or(
      ilike(memories.key, searchPattern),
      ilike(memories.content, searchPattern),
    )!,
  ];

  if (filter?.workspaceId) {
    conditions.push(
      or(
        eq(memories.workspaceId, filter.workspaceId),
        eq(memories.scope, "global"),
      )!,
    );
  }

  return await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.updatedAt))
    .limit(filter?.limit ?? 20);
}

export async function deleteMemory(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .returning();
  return result.length > 0;
}

export async function recallMemory(
  id: string,
  userId: string,
): Promise<Memory | null> {
  const [updated] = await db
    .update(memories)
    .set({ lastRecalledAt: new Date() })
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .returning();
  return updated || null;
}

/**
 * Delete all user data on account purge
 */
export async function deleteAllUserAiData(
  userId: string,
  tx?: DrizzleTx,
): Promise<void> {
  const execute = async (client: any) => {
    await client.delete(userApiKeys).where(eq(userApiKeys.userId, userId));
    await client.delete(conversations).where(eq(conversations.userId, userId));
    await client.delete(memories).where(eq(memories.userId, userId));
  };

  if (tx) {
    await execute(tx);
  } else {
    await db.transaction(execute);
  }
}
