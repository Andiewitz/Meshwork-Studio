import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

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

function generateIV(): Buffer {
  return crypto.randomBytes(IV_LENGTH);
}

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

export function generateKeyHint(apiKey: string): string {
  if (apiKey.length <= 4) {
    return apiKey;
  }
  return "..." + apiKey.slice(-4);
}

export function validateKeyFormat(provider: string, apiKey: string): boolean {
  switch (provider) {
    case "openai":
      return apiKey.startsWith("sk-") && apiKey.length >= 20;
    case "anthropic":
      return apiKey.startsWith("sk-ant-") && apiKey.length >= 20;
    case "openrouter":
      return apiKey.startsWith("sk-or-") && apiKey.length >= 10;
    case "gemini":
      return apiKey.length >= 10;
    default:
      return false;
  }
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString("base64");
}
