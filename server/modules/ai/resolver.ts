import { createChildLogger } from "../../lib/logger";
import { getActiveKeyForProvider, getApiKeyWithPlaintext } from "./db";

const log = createChildLogger("ai-resolver");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The provider used for the free tier (app-owned Gemini key). */
export const DEFAULT_PROVIDER = "gemini";

/** The model served on the free tier. */
export const DEFAULT_FREE_MODEL = "gemini-2.0-flash";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedProvider {
  provider: string; // "gemini" | "anthropic" | "openai" | "openrouter"
  model: string;
  apiKey: string;
  source: "byok" | "fallback";
}

export type ProviderResolutionCode =
  "BYOK_DECRYPT_FAILED" | "NO_ACTIVE_KEY" | "FALLBACK_NOT_CONFIGURED";

/**
 * Typed error thrown by the resolver so the route handler can map it
 * to a specific HTTP status + user-facing message.
 */
export class ProviderResolutionError extends Error {
  public readonly code: ProviderResolutionCode;

  constructor(code: ProviderResolutionCode, message: string) {
    super(message);
    this.name = "ProviderResolutionError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Resolver — the ONE decision point
// ---------------------------------------------------------------------------

/**
 * Determine which provider, model, and API key to use for a request.
 *
 * Rules:
 * 1. If no provider is requested (or the default is requested), use the
 *    free-tier fallback key from `GEMINI_API_KEY`. No DB lookup.
 * 2. If a non-default provider is requested, look up the user's BYOK key.
 *    - If found and decryptable → use it.
 *    - If found but decrypt fails → throw BYOK_DECRYPT_FAILED (do NOT
 *      silently fall back — that would be a cost/abuse vector).
 *    - If not found → throw NO_ACTIVE_KEY (do NOT silently swap providers).
 * 3. If the fallback env var is missing → throw FALLBACK_NOT_CONFIGURED.
 */
export async function resolveProviderForRequest(
  userId: string,
  requestedProvider: string | undefined,
  requestedModel: string | undefined,
): Promise<ResolvedProvider> {
  // Explicit request for the free/default provider always uses fallback,
  // even if the user happens to have a BYOK key for something else stored.
  const wantsDefault =
    !requestedProvider ||
    requestedProvider === DEFAULT_PROVIDER ||
    requestedProvider === "openrouter";

  if (!wantsDefault) {
    // ------------------------------------------------------------------
    // BYOK path
    // ------------------------------------------------------------------
    const activeKey = await getActiveKeyForProvider(userId, requestedProvider);

    if (activeKey) {
      const decrypted = await getApiKeyWithPlaintext(userId, activeKey.id);

      if (!decrypted) {
        // Key exists but decryption failed — this is a real error state,
        // not a reason to silently fall back. Surface it.
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

    // User explicitly asked for a non-default provider they have no key for.
    // Do NOT silently fall back.
    throw new ProviderResolutionError(
      "NO_ACTIVE_KEY",
      `No API key found for ${requestedProvider}. Add one in settings, or use the default provider.`,
    );
  }

  // ------------------------------------------------------------------
  // Free-tier fallback path — no DB lookup at all
  // ------------------------------------------------------------------
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
