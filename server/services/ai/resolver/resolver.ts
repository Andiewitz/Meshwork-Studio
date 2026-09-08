import { createChildLogger } from "@server/lib/logger";
import { getActiveKeyForProvider, getApiKeyWithPlaintext } from "../db/storage";

const log = createChildLogger("ai-resolver");

export const DEFAULT_PROVIDER = "gemini";
export const DEFAULT_FREE_MODEL = "gemini-3.5-flash";

const ALLOWED_MODELS: Record<string, readonly string[]> = {
  gemini: ["gemini-3.5-flash", "gemini-3.5-flash-lite"],
  openai: ["gpt-4o-mini", "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: [
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet",
    "claude-3-opus",
  ],
  openrouter: ["meta-llama/llama-3-8b-instruct:free"],
};

function allowedModel(provider: string, requested?: string): string {
  const models = ALLOWED_MODELS[provider] ?? ALLOWED_MODELS.gemini;
  return requested && models.includes(requested) ? requested : models[0];
}

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
        model: allowedModel(requestedProvider, requestedModel),
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

  const resolvedModel = allowedModel("gemini", requestedModel);

  return {
    provider: "gemini",
    model: resolvedModel,
    apiKey: fallbackKey,
    source: "fallback",
  };
}
