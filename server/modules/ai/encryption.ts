import crypto from "crypto";

/**
 * Encryption module for BYOK AI service
 * Uses AES-256-GCM with unique IV per encryption
 * Master key from ENCRYPTION_KEY env var
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // bytes
const AUTH_TAG_LENGTH = 16; // bytes
const KEY_LENGTH = 32; // bytes (256 bits)

/**
 * Get master encryption key from environment
 * Must be 32 bytes base64 encoded
 */
function getMasterKey(): Buffer {
  const keyBase64 = process.env.ENCRYPTION_KEY;

  if (!keyBase64) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }

  const key = Buffer.from(keyBase64, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_LENGTH} bytes when decoded, got ${key.length}`,
    );
  }

  return key;
}

/**
 * Generate a random initialization vector
 */
function generateIV(): Buffer {
  return crypto.randomBytes(IV_LENGTH);
}

/**
 * Encrypt an API key using AES-256-GCM
 * @param plaintext - The API key to encrypt
 * @returns Object containing encrypted data, IV, and auth tag (all base64 encoded)
 */
export function encryptApiKey(plaintext: string): {
  encryptedData: string;
  iv: string;
  authTag: string;
} {
  const key = getMasterKey();
  const iv = generateIV();

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt an API key using AES-256-GCM
 * @param encryptedData - Base64 encoded encrypted data
 * @param iv - Base64 encoded initialization vector
 * @param authTag - Base64 encoded authentication tag
 * @returns Decrypted API key
 */
export function decryptApiKey(
  encryptedData: string,
  iv: string,
  authTag: string,
): string {
  const key = getMasterKey();

  const ivBuffer = Buffer.from(iv, "base64");
  const authTagBuffer = Buffer.from(authTag, "base64");

  if (ivBuffer.length !== IV_LENGTH) {
    throw new Error(
      `Invalid IV length: expected ${IV_LENGTH}, got ${ivBuffer.length}`,
    );
  }

  if (authTagBuffer.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTagBuffer.length}`,
    );
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a key hint for UI display (last 4 characters)
 * @param apiKey - The raw API key
 * @returns Key hint like "...wxyz"
 */
export function generateKeyHint(apiKey: string): string {
  if (apiKey.length <= 4) {
    return apiKey;
  }
  return "..." + apiKey.slice(-4);
}

/**
 * Validate that an API key format looks correct for a provider
 * Does NOT validate with the provider, just checks format
 */
export function validateKeyFormat(provider: string, apiKey: string): boolean {
  switch (provider) {
    case "openai":
      // OpenAI keys start with "sk-" and are typically 51 chars
      return apiKey.startsWith("sk-") && apiKey.length >= 20;
    case "anthropic":
      // Anthropic keys start with "sk-ant-"
      return apiKey.startsWith("sk-ant-") && apiKey.length >= 20;
    case "openrouter":
      // OpenRouter keys start with "sk-or-"
      return apiKey.startsWith("sk-or-") && apiKey.length >= 10;
    case "gemini":
      // Gemini API keys
      return apiKey.length >= 10;
    default:
      // Unknown provider — reject rather than silently accept
      return false;
  }
}

/**
 * Generate a new encryption key for environment setup
 * Run this once and save the output to .env
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString("base64");
}
