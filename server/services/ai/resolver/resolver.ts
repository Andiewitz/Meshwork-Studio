import { createChildLogger } from "@server/lib/logger";
import { getActiveKeyForProvider, getApiKeyWithPlaintext } from "../db/storage";

const log = createChildLogger("ai-resolver");

export const DEFAULT_PROVIDER = "gemini";
export const DEFAULT_FREE_MODEL = "gemini-3.5-flash";

export interface ResolvedProvider {
  provider: string; // "gemini" | "anthropic" | "openai" | "openrouter"
  model: string;
  apiKey: string;
  source: "byok" | "fallback";
}

export type ProviderResolutionCode =
  "BYOK_DECRYPT_FAILED" | "NO_ACTIVE_KEY" | "FALLBACK_NOT_CONFIGURED";

export class ProviderResolutionError extends Error {
  public readonly code: ProviderResolutionCode;

  constructor(code: ProviderResolutionCode, message: string) {
    super(message);
    this.name = "ProviderResolutionError";
    this.code = code;
  }
}

export async function resolveProviderForRequest(
  userId: string,
  requestedProvider: string | undefined,
  requestedModel: string | undefined,
): Promise<ResolvedProvider> {
  const wantsDefault =
    !requestedProvider ||
    requestedProvider === DEFAULT_PROVIDER ||
    requestedProvider === "openrouter";

  if (!wantsDefault) {
    const activeKey = await getActiveKeyForProvider(userId, requestedProvider);

    if (activeKey) {
      const decrypted = await getApiKeyWithPlaintext(userId, activeKey.id);

      if (!decrypted) {
        log.warn(
          { userId, provider: requestedProvider, keyId: activeKey.id },
          "BYOK key exists but decryption failed",
        );
        throw new ProviderResolutionError(
          "BYOK_DECRYPT_FAILED",
          "Your stored API key could not be decrypted. Try removing and re-adding it.",
        );
      }

      log.debug(
        { userId, provider: requestedProvider, source: "byok" },
        "Resolved to BYOK key",
      );

      return {
        provider: requestedProvider,
        model: requestedModel ?? DEFAULT_FREE_MODEL,
        apiKey: decrypted.plaintextKey,
        source: "byok",
      };
    }

    throw new ProviderResolutionError(
      "NO_ACTIVE_KEY",
      `No API key found for ${requestedProvider}. Add one in settings, or use the default provider.`,
    );
  }

  const fallbackKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENAI_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim();

  if (!fallbackKey) {
    log.error("GEMINI_API_KEY not set — free tier unavailable");
    throw new ProviderResolutionError(
      "FALLBACK_NOT_CONFIGURED",
      "The default AI provider is not configured. Set GEMINI_API_KEY.",
    );
  }

  log.debug(
    { userId, source: "fallback" },
    "Resolved to Gemini free-tier fallback",
  );

  const resolvedModel =
    requestedModel &&
    !requestedModel.includes("gpt-oss") &&
    !requestedModel.includes("/")
      ? requestedModel
      : DEFAULT_FREE_MODEL;

  return {
    provider: "gemini",
    model: resolvedModel,
    apiKey: fallbackKey,
    source: "fallback",
  };
}
