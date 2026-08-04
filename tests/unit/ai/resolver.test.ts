import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveProviderForRequest,
  ProviderResolutionError,
  DEFAULT_PROVIDER,
  DEFAULT_FREE_MODEL,
} from "@server/modules/ai/resolver";

// Mock the DB functions used by the resolver
vi.mock("@server/modules/ai/db", () => ({
  getActiveKeyForProvider: vi.fn(),
  getApiKeyWithPlaintext: vi.fn(),
}));

import {
  getActiveKeyForProvider,
  getApiKeyWithPlaintext,
} from "@server/modules/ai/db";

const mockedGetActiveKey = vi.mocked(getActiveKeyForProvider);
const mockedGetPlaintext = vi.mocked(getApiKeyWithPlaintext);

describe("resolveProviderForRequest", () => {
  const userId = "user-123";
  let originalGeminiEnv: string | undefined;
  let originalOpenrouterEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalGeminiEnv = process.env.GEMINI_API_KEY;
    originalOpenrouterEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-test-fallback-key";
  });

  afterEach(() => {
    if (originalGeminiEnv !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiEnv;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalOpenrouterEnv !== undefined) {
      process.env.OPENROUTER_API_KEY = originalOpenrouterEnv;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  // -----------------------------------------------------------------
  // Free-tier / fallback path
  // -----------------------------------------------------------------

  describe("free-tier fallback path", () => {
    it("should use fallback when no provider is specified", async () => {
      const result = await resolveProviderForRequest(
        userId,
        undefined,
        undefined,
      );

      expect(result).toEqual({
        provider: "gemini",
        model: DEFAULT_FREE_MODEL,
        apiKey: "sk-or-test-fallback-key",
        source: "fallback",
      });

      // Must NOT query the database
      expect(mockedGetActiveKey).not.toHaveBeenCalled();
      expect(mockedGetPlaintext).not.toHaveBeenCalled();
    });

    it("should use fallback when provider is the default", async () => {
      const result = await resolveProviderForRequest(
        userId,
        DEFAULT_PROVIDER,
        undefined,
      );

      expect(result.source).toBe("fallback");
      expect(result.provider).toBe("gemini");
      expect(mockedGetActiveKey).not.toHaveBeenCalled();
    });

    it("should sanitize model name and return DEFAULT_FREE_MODEL for openrouter model strings", async () => {
      const result = await resolveProviderForRequest(
        userId,
        undefined,
        "google/gemma-4-31b-it:free",
      );

      expect(result.model).toBe(DEFAULT_FREE_MODEL);
      expect(result.source).toBe("fallback");
    });

    it("should trim whitespace from OPENROUTER_API_KEY", async () => {
      delete process.env.GEMINI_API_KEY;
      process.env.OPENROUTER_API_KEY = "  sk-or-test-key  ";
      const result = await resolveProviderForRequest(
        userId,
        undefined,
        undefined,
      );
      expect(result.apiKey).toBe("sk-or-test-key");
    });
  });

  // -----------------------------------------------------------------
  // FALLBACK_NOT_CONFIGURED
  // -----------------------------------------------------------------

  describe("FALLBACK_NOT_CONFIGURED", () => {
    it("should throw when OPENROUTER_API_KEY is not set", async () => {
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        resolveProviderForRequest(userId, undefined, undefined),
      ).rejects.toThrow(ProviderResolutionError);

      try {
        await resolveProviderForRequest(userId, undefined, undefined);
      } catch (e: any) {
        expect(e.code).toBe("FALLBACK_NOT_CONFIGURED");
      }
    });

    it("should throw when OPENROUTER_API_KEY is empty string", async () => {
      process.env.OPENROUTER_API_KEY = "";

      await expect(
        resolveProviderForRequest(userId, undefined, undefined),
      ).rejects.toThrow(ProviderResolutionError);
    });

    it("should throw when OPENROUTER_API_KEY is only whitespace", async () => {
      process.env.OPENROUTER_API_KEY = "   ";

      await expect(
        resolveProviderForRequest(userId, undefined, undefined),
      ).rejects.toThrow(ProviderResolutionError);
    });
  });

  // -----------------------------------------------------------------
  // BYOK path
  // -----------------------------------------------------------------

  describe("BYOK path", () => {
    const fakeActiveKey = {
      id: "key-abc",
      userId: "user-123",
      provider: "anthropic",
      encryptedKey: "encrypted",
      iv: "iv",
      authTag: "tag",
      keyHint: "...1234",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should return BYOK key when user has an active key", async () => {
      mockedGetActiveKey.mockResolvedValue(fakeActiveKey);
      mockedGetPlaintext.mockResolvedValue({
        ...fakeActiveKey,
        plaintextKey: "sk-ant-real-key-value",
      });

      const result = await resolveProviderForRequest(
        userId,
        "anthropic",
        "claude-3-opus",
      );

      expect(result).toEqual({
        provider: "anthropic",
        model: "claude-3-opus",
        apiKey: "sk-ant-real-key-value",
        source: "byok",
      });

      expect(mockedGetActiveKey).toHaveBeenCalledWith(userId, "anthropic");
      expect(mockedGetPlaintext).toHaveBeenCalledWith(userId, "key-abc");
    });

    it("should use default model when none requested with BYOK", async () => {
      mockedGetActiveKey.mockResolvedValue(fakeActiveKey);
      mockedGetPlaintext.mockResolvedValue({
        ...fakeActiveKey,
        plaintextKey: "sk-ant-real-key-value",
      });

      const result = await resolveProviderForRequest(
        userId,
        "anthropic",
        undefined,
      );

      expect(result.model).toBe(DEFAULT_FREE_MODEL);
      expect(result.source).toBe("byok");
    });
  });

  // -----------------------------------------------------------------
  // NO_ACTIVE_KEY
  // -----------------------------------------------------------------

  describe("NO_ACTIVE_KEY", () => {
    it("should throw when user requests a BYOK provider with no key", async () => {
      mockedGetActiveKey.mockResolvedValue(null);

      await expect(
        resolveProviderForRequest(userId, "anthropic", "claude-3-opus"),
      ).rejects.toThrow(ProviderResolutionError);

      try {
        await resolveProviderForRequest(userId, "anthropic", "claude-3-opus");
      } catch (e: any) {
        expect(e.code).toBe("NO_ACTIVE_KEY");
        expect(e.message).toContain("anthropic");
      }
    });

    it("should NOT silently fall back to free tier", async () => {
      mockedGetActiveKey.mockResolvedValue(null);

      // The resolve should throw, NOT return a fallback result
      try {
        await resolveProviderForRequest(userId, "anthropic", undefined);
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.code).toBe("NO_ACTIVE_KEY");
        // Must NOT have returned source: "fallback"
        expect(e).toBeInstanceOf(ProviderResolutionError);
      }
    });
  });

  // -----------------------------------------------------------------
  // BYOK_DECRYPT_FAILED
  // -----------------------------------------------------------------

  describe("BYOK_DECRYPT_FAILED", () => {
    it("should throw when key exists but decryption returns null", async () => {
      mockedGetActiveKey.mockResolvedValue({
        id: "key-abc",
        provider: "openai",
        isActive: true,
      } as any);
      mockedGetPlaintext.mockResolvedValue(null);

      await expect(
        resolveProviderForRequest(userId, "openai", "gpt-4"),
      ).rejects.toThrow(ProviderResolutionError);

      try {
        await resolveProviderForRequest(userId, "openai", "gpt-4");
      } catch (e: any) {
        expect(e.code).toBe("BYOK_DECRYPT_FAILED");
        expect(e.message).toContain("decrypted");
      }
    });

    it("should NOT fall back to free tier on decrypt failure", async () => {
      mockedGetActiveKey.mockResolvedValue({
        id: "key-abc",
        provider: "openai",
        isActive: true,
      } as any);
      mockedGetPlaintext.mockResolvedValue(null);

      try {
        await resolveProviderForRequest(userId, "openai", "gpt-4");
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e).toBeInstanceOf(ProviderResolutionError);
        expect(e.code).toBe("BYOK_DECRYPT_FAILED");
      }
    });
  });
});
