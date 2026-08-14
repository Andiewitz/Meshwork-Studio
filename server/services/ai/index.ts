import type { Express } from "express";
import { createAIRoutes } from "./routes/aiRoutes";
import { createChildLogger } from "@server/lib/logger";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("ai-service");

/**
 * AI Service - BYOK (Bring Your Own Key) & Free-Tier AI Service
 *
 * This service provides:
 * - Secure encrypted storage of user API keys
 * - Server-side proxy to AI providers (OpenAI, Anthropic, Gemini, OpenRouter)
 * - Decoupled rate-limiting, key encryption, and resolver boundaries
 * - Key management endpoints
 */
export class AIService {
  static initialize(app: Express, context: AppContext) {
    // Mount AI routes under /api/v1/ai
    app.use("/api/v1/ai", createAIRoutes(context));

    log.info("AI service initialized at /api/v1/ai");
  }
}

// Backward compatibility alias
export const AIModule = AIService;

export * from "./db";
export * from "./encryption";
export * from "./providers";
export * from "./rate-limit";
export * from "./resolver";
export * from "./routes";
