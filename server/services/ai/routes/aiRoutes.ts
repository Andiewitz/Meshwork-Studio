import { Router, Request, Response, RequestHandler } from "express";
import { createChildLogger } from "@server/lib/logger";
import {
  createApiKey,
  deleteApiKey,
  getUserApiKeys,
  getApiKeyWithPlaintext,
  getActiveKeyForProvider,
} from "../db/storage";
import { validateKeyFormat } from "../encryption";
import {
  aiChatRequestsTotal,
  aiChatDurationSeconds,
} from "@server/lib/metrics";
import { csrfProtection } from "@server/middleware/csrf";
import { aiChatLimiter, aiFreeTierLimiter } from "../rate-limit/rateLimit";
import {
  resolveProviderForRequest,
  ProviderResolutionError,
  DEFAULT_PROVIDER,
} from "../resolver";
import type { AppContext } from "@server/lib/registry";

const log = createChildLogger("ai-routes");

interface CanvasNode {
  id: string;
  type?: string;
  source?: string;
  data?: Record<string, unknown>;
}

interface CanvasEdge {
  source: string;
  target: string;
}

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
}

function handleResolutionError(error: ProviderResolutionError, res: Response) {
  switch (error.code) {
    case "BYOK_DECRYPT_FAILED":
      return res.status(500).json({ code: error.code, message: error.message });
    case "NO_ACTIVE_KEY":
      return res.status(404).json({ code: error.code, message: error.message });
    case "FALLBACK_NOT_CONFIGURED":
      return res.status(503).json({ code: error.code, message: error.message });
    default:
      return res.status(500).json({ message: error.message });
  }
}

export function createAIRoutes(context: AppContext) {
  const router = Router();
  const isAuthenticated =
    context.registry.get<RequestHandler>("isAuthenticated");

  const csrfEnabled =
    process.env.ENABLE_CSRF === "true" || process.env.NODE_ENV === "production";
  const conditionalCsrf = csrfEnabled
    ? csrfProtection
    : (_req: Request, _res: Response, next: () => void) => next();

  // List keys
  router.get("/keys", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const keys = await getUserApiKeys(userId);

      res.json(
        keys.map((key) => ({
          id: key.id,
          provider: key.provider,
          keyHint: key.keyHint,
          isActive: key.isActive,
          createdAt: key.createdAt,
        })),
      );
    } catch (error) {
      log.error({ err: error, userId: req.user?.id }, "Failed to list keys");
      res.status(500).json({ message: "Failed to retrieve API keys" });
    }
  });

  // Add a new API key
  router.post(
    "/keys",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const { provider, apiKey } = req.body;

        if (!provider || !apiKey) {
          return res
            .status(400)
            .json({ message: "Provider and apiKey are required" });
        }

        if (!validateKeyFormat(provider, apiKey)) {
          return res.status(400).json({
            message: `Invalid API key format for ${provider}`,
          });
        }

        const key = await createApiKey({ userId, provider, apiKey });

        res.status(201).json({
          id: key.id,
          provider: key.provider,
          keyHint: key.keyHint,
          isActive: key.isActive,
          createdAt: key.createdAt,
        });
      } catch (error) {
        log.error(
          { err: error, userId: req.user?.id, provider: req.body?.provider },
          "Failed to create key",
        );
        res.status(500).json({ message: "Failed to store API key" });
      }
    },
  );

  // Test an API key without storing it
  router.post(
    "/keys/test",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const { provider, apiKey } = req.body;

        if (!provider || !apiKey) {
          return res
            .status(400)
            .json({ message: "Provider and apiKey are required" });
        }

        if (!validateKeyFormat(provider, apiKey)) {
          return res.status(400).json({
            message: `Invalid API key format for ${provider}`,
          });
        }

        let valid = false;
        let validationError = "";

        try {
          if (provider === "gemini") {
            const { validateGeminiKey } = await import("../providers/gemini");
            valid = await validateGeminiKey(apiKey);
          } else if (provider === "openai") {
            const { validateOpenAIKey } = await import("../providers/openai");
            valid = await validateOpenAIKey(apiKey);
          } else if (provider === "anthropic") {
            const { validateAnthropicKey } =
              await import("../providers/anthropic");
            valid = await validateAnthropicKey(apiKey);
          } else if (provider === "openrouter") {
            const { validateOpenRouterKey } =
              await import("../providers/openrouter");
            valid = await validateOpenRouterKey(apiKey);
          } else {
            return res
              .status(400)
              .json({ message: `Unsupported provider: ${provider}` });
          }
        } catch (validationErr: unknown) {
          log.error(
            { err: validationErr, provider },
            "Key validation call failed",
          );
          validationError = "Could not reach provider to validate key";
        }

        if (!valid && !validationError) {
          validationError = `API key is not valid for ${provider}`;
        }

        res.json({
          valid,
          message: valid ? "API key is valid and working" : validationError,
        });
      } catch (error) {
        log.error(
          { err: error, provider: req.body?.provider },
          "Failed to test key",
        );
        res.status(500).json({ message: "Failed to test API key" });
      }
    },
  );

  // Delete an API key
  router.delete(
    "/keys/:id",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const keyId = req.params.id as string;

        const deleted = await deleteApiKey(userId, keyId);

        if (!deleted) {
          return res.status(404).json({ message: "API key not found" });
        }

        res.json({ success: true });
      } catch (error) {
        log.error(
          { err: error, userId: req.user?.id, keyId: req.params.id },
          "Failed to delete key",
        );
        res.status(500).json({ message: "Failed to delete API key" });
      }
    },
  );

  // Proxy chat completion request
  router.post(
    "/chat",
    isAuthenticated,
    conditionalCsrf,
    aiChatLimiter,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const { provider, model, messages, temperature, maxTokens, stream } =
          req.body as {
            provider?: string;
            model?: string;
            messages: {
              role: "user" | "assistant" | "system";
              content: string;
            }[];
            temperature?: number;
            maxTokens?: number;
            stream?: boolean;
          };

        if (!messages || !Array.isArray(messages)) {
          return res
            .status(400)
            .json({ message: "messages array is required" });
        }

        const start = process.hrtime();

        let resolved;
        try {
          resolved = await resolveProviderForRequest(userId, provider, model);
        } catch (error) {
          if (error instanceof ProviderResolutionError) {
            return handleResolutionError(error, res);
          }
          throw error;
        }

        if (resolved.source === "fallback") {
          const freeTierAllowed = await new Promise<boolean>((resolve) => {
            aiFreeTierLimiter(req, res, (err?: unknown) => {
              if (err) {
                resolve(false);
              } else {
                resolve(!res.headersSent);
              }
            });
          });
          if (!freeTierAllowed || res.headersSent) return;
        }

        res.on("finish", () => {
          const duration = process.hrtime(start);
          const durationInSeconds = duration[0] + duration[1] / 1e9;
          const status = res.statusCode >= 400 ? "error" : "success";

          aiChatRequestsTotal
            .labels(resolved.provider, resolved.model, status)
            .inc();
          aiChatDurationSeconds
            .labels(resolved.provider)
            .observe(durationInSeconds);
        });

        const apiKey = resolved.apiKey;
        const resolvedProvider = resolved.provider;
        const resolvedModel = resolved.model;

        log.info(
          {
            userId,
            provider: resolvedProvider,
            model: resolvedModel,
            source: resolved.source,
          },
          "Chat request resolved",
        );

        if (resolvedProvider === "gemini") {
          const { createGeminiChatCompletion, streamGeminiChatCompletion } =
            await import("../providers/gemini");

          if (stream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const sseStream = streamGeminiChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: true,
            });

            for await (const chunk of sseStream) {
              res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            res.write("data: [DONE]\n\n");
            res.end();
          } else {
            const response = await createGeminiChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: false,
            });
            res.json(response);
          }
        } else if (resolvedProvider === "openai") {
          const { createOpenAIChatCompletion } =
            await import("../providers/openai");

          if (stream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const { streamOpenAIChatCompletion } =
              await import("../providers/openai");
            const sseStream = streamOpenAIChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: true,
            });

            for await (const chunk of sseStream) {
              res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            res.write("data: [DONE]\n\n");
            res.end();
          } else {
            const response = await createOpenAIChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: false,
            });
            res.json(response);
          }
        } else if (resolvedProvider === "anthropic") {
          const {
            createAnthropicChatCompletion,
            streamAnthropicChatCompletion,
          } = await import("../providers/anthropic");

          if (stream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const sseStream = streamAnthropicChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: true,
            });

            for await (const chunk of sseStream) {
              res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            res.write("data: [DONE]\n\n");
            res.end();
          } else {
            const response = await createAnthropicChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: false,
            });

            const data = await response.json();
            res.json(data);
          }
        } else if (resolvedProvider === "openrouter") {
          const {
            createOpenRouterChatCompletion,
            streamOpenRouterChatCompletion,
          } = await import("../providers/openrouter");

          if (stream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const sseStream = streamOpenRouterChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: true,
            });

            for await (const chunk of sseStream) {
              res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            res.write("data: [DONE]\n\n");
            res.end();
          } else {
            const response = await createOpenRouterChatCompletion(apiKey, {
              model: resolvedModel,
              messages,
              temperature,
              maxTokens,
              stream: false,
            });
            res.json(response);
          }
        } else {
          return res
            .status(400)
            .json({ message: `Unsupported provider: ${resolvedProvider}` });
        }
      } catch (error: unknown) {
        log.error(
          {
            err: error,
            userId: req.user?.id,
          },
          "Chat completion failed",
        );

        const providerError = error as {
          status?: number;
          statusCode?: number;
          message?: string;
        };
        const statusCode =
          providerError.status ?? providerError.statusCode ?? 502;
        const message =
          providerError.message ?? "AI provider returned an error";
        res
          .status(statusCode >= 400 && statusCode < 600 ? statusCode : 502)
          .json({
            code: "PROVIDER_ERROR",
            message,
          });
      }
    },
  );

  // Generate suggestions
  router.post(
    "/suggestions",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const { canvas } = req.body as {
          canvas?: { nodes?: CanvasNode[]; edges?: CanvasEdge[] };
        };

        let resolved;
        try {
          resolved = await resolveProviderForRequest(
            userId,
            undefined,
            undefined,
          );
        } catch (error) {
          if (error instanceof ProviderResolutionError) {
            return res.json([
              "Design a scalable Kubernetes microservices architecture",
              "Set up a high-availability Postgres cluster",
              "Build a serverless event-driven data pipeline",
              "Create a secure AWS VPC with public/private subnets",
            ]);
          }
          throw error;
        }

        const { provider, apiKey } = resolved;

        let suggestionsModel: string;
        if (provider === "gemini") {
          suggestionsModel = "gemini-3.5-flash";
        } else if (provider === "openai") {
          suggestionsModel = "gpt-4o-mini";
        } else if (provider === "anthropic") {
          suggestionsModel = "claude-3-5-haiku-20241022";
        } else if (provider === "openrouter") {
          suggestionsModel = "meta-llama/llama-3-8b-instruct:free";
        } else {
          return res.status(400).json({
            message: `Unsupported provider for suggestions: ${provider}`,
          });
        }

        const canvasNodes: CanvasNode[] = canvas?.nodes ?? [];
        const canvasEdges: CanvasEdge[] = canvas?.edges ?? [];

        const prompt = `You are Mosh, the expert cloud architecture co-pilot for Meshwork Studio. 
Based on the current canvas state, generate 4 short, highly relevant, and actionable next-step suggestions or starter layout ideas for the user.

Current canvas contains:
- Nodes: ${JSON.stringify(canvasNodes.map((n) => ({ id: n.id, type: n.type, label: n.data?.label ?? n.type })))}
- Edges: ${JSON.stringify(canvasEdges.map((e) => ({ source: e.source, target: e.target })))}

Each suggestion MUST be extremely short (under 6 words).
Provide suggestions that represent logical additions, connections, security settings, or best practices for the current nodes.
If the canvas is empty, provide 4 starter template ideas (e.g. "Create a VPC with Subnets", "Deploy a microservice cluster", "Set up a serverless pipeline", "Design a 3-tier web app").

You MUST return ONLY a valid JSON array of strings, e.g.:
["Add a Redis cache", "Connect Gateway to Backend", "Set up VPC subnets", "Add a load balancer"]

Do NOT wrap the output in markdown code blocks like \`\`\`json. Return only the raw JSON.`;

        let responseText = "";

        if (provider === "gemini") {
          const { createGeminiChatCompletion } =
            await import("../providers/gemini");
          const response = (await createGeminiChatCompletion(apiKey, {
            model: suggestionsModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            maxTokens: 1000,
            stream: false,
          })) as ChatCompletionResponse;
          responseText = response.choices?.[0]?.message?.content ?? "";
        } else if (provider === "openrouter") {
          const { createOpenRouterChatCompletion } =
            await import("../providers/openrouter");
          const response = (await createOpenRouterChatCompletion(apiKey, {
            model: suggestionsModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            maxTokens: 1000,
            stream: false,
          })) as ChatCompletionResponse;
          responseText = response.choices?.[0]?.message?.content ?? "";
        } else if (provider === "openai") {
          const { createOpenAIChatCompletion } =
            await import("../providers/openai");
          const response = (await createOpenAIChatCompletion(apiKey, {
            model: suggestionsModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            maxTokens: 1000,
            stream: false,
          })) as ChatCompletionResponse;
          responseText = response.choices?.[0]?.message?.content ?? "";
        } else if (provider === "anthropic") {
          const { createAnthropicChatCompletion } =
            await import("../providers/anthropic");
          const response = await createAnthropicChatCompletion(apiKey, {
            model: suggestionsModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            maxTokens: 1000,
            stream: false,
          });
          const data = await response.json();
          responseText = data.content?.[0]?.text || "";
        }

        responseText = responseText.trim();

        const jsonMatch = /^(?:```(?:json)?\n)?([\s\S]*?)(?:\n```)?$/.exec(
          responseText,
        );
        if (jsonMatch) {
          responseText = jsonMatch[1].trim();
        }

        try {
          const suggestions = JSON.parse(responseText);
          if (Array.isArray(suggestions)) {
            return res.json(suggestions.slice(0, 4));
          }
          throw new Error("Response was not a JSON array");
        } catch (e) {
          log.warn(
            { response: responseText, err: e },
            "Failed to parse suggestions response, returning default suggestions",
          );
          return res.json([
            "Connect API Gateway to services",
            "Add a Redis cache cluster",
            "Set up database replica",
            "Add CloudFront CDN for static assets",
          ]);
        }
      } catch (error: unknown) {
        log.error({ err: error, userId: req.user?.id }, "Suggestions failed");
        return res.json([
          "Design a scalable Kubernetes microservices architecture",
          "Set up a high-availability Postgres cluster",
          "Build a serverless event-driven data pipeline",
          "Create a secure AWS VPC with public/private subnets",
        ]);
      }
    },
  );

  // List supported AI providers
  router.get(
    "/providers",
    isAuthenticated,
    async (_req: Request, res: Response) => {
      res.json([
        {
          id: "gemini",
          name: "Google Gemini",
          models: [
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.7-flash",
          ],
          requiresByok: false,
          isDefault: true,
        },
        {
          id: "openai",
          name: "OpenAI",
          models: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
          requiresByok: true,
        },
        {
          id: "anthropic",
          name: "Anthropic",
          models: ["claude-3-5-sonnet", "claude-3-opus"],
          requiresByok: true,
        },
      ]);
    },
  );

  return router;
}

export default createAIRoutes;
