import { eq, and, desc } from "drizzle-orm";
import { db } from "./connection";
import { userApiKeys, type UserApiKey } from "./schema";
import { encryptApiKey, decryptApiKey, generateKeyHint } from "../encryption";
import type { DrizzleTx } from "@server/lib/events";

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
