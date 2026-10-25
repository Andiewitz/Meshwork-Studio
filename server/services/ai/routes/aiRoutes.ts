import { Router, Request, Response, RequestHandler } from "express";
import { ZodError } from "zod";
import { createChildLogger } from "@server/lib/logger";
import { fail } from "@server/lib/errorEnvelope";
import { firstIssueMessage, zodIssues } from "@server/lib/validation";
import { logTraceback } from "@server/lib/traceback";
import {
  createApiKey,
  deleteApiKey,
  getUserApiKeys,
  getApiKeyWithPlaintext,
  getActiveKeyForProvider,
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  createMessage,
  getMessagesByConversationId,
  createMemory,
  getMemories,
  searchMemories,
  deleteMemory,
  recallMemory,
} from "../db/storage";
import {
  insertConversationSchema,
  insertMessageSchema,
  insertMemorySchema,
} from "../db/schema";
import { validateKeyFormat } from "../encryption";
import {
  aiChatRequestsTotal,
  aiChatDurationSeconds,
} from "@server/lib/metrics";
import { csrfProtect } from "../../../auth";

import { aiChatLimiter, aiFreeTierLimiter } from "../rate-limit/rateLimit";
import {
  resolveProviderForRequest,
  ProviderResolutionError,
  DEFAULT_PROVIDER,
} from "../resolver";
import type { AppContext } from "@server/lib/registry";
import {
  abortReason,
  ClientDisconnectedError,
  createProviderAbortScope,
  ProviderTimeoutError,
  type ProviderAbortScope,
} from "../providers/runtime";

const log = createChildLogger("ai-routes");
const MAX_CHAT_TOKENS = 1_024;
const DEFAULT_CHAT_TOKENS = 512;

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

function handleResolutionError(
  error: ProviderResolutionError,
  req: Request,
  res: Response,
) {
  switch (error.code) {
    case "BYOK_DECRYPT_FAILED":
      return fail(req, res, "BYOK_DECRYPT_FAILED", error.message);
    case "NO_ACTIVE_KEY":
      return fail(req, res, "NO_ACTIVE_KEY", error.message);
    case "FALLBACK_NOT_CONFIGURED":
      return fail(req, res, "FALLBACK_NOT_CONFIGURED", error.message);
    default:
      return fail(
        req,
        res,
        "INTERNAL",
        "AI provider selection failed. Try again.",
      );
  }
}

function writeSse(
  res: Response,
  payload: unknown,
  eventName?: "error",
): boolean {
  if (res.destroyed || res.writableEnded) return false;
  const eventPrefix = eventName ? `event: ${eventName}\n` : "";
  res.write(`${eventPrefix}data: ${JSON.stringify(payload)}\n\n`);
  return !res.destroyed && !res.writableEnded;
}

export function createAIRoutes(context: AppContext) {
  const router = Router();
  const isAuthenticated =
    context.registry.get<RequestHandler>("isAuthenticated");

  // Use the new session-bound CSRF guard from the auth rewrite
  const conditionalCsrf = csrfProtect;

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
      logTraceback(log, "Failed to list keys", error, {
        userId: req.user?.id,
        requestId: req.requestId ?? "unscoped",
      });
      fail(req, res, "AI_UNAVAILABLE", "Failed to retrieve API keys");
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
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            "Provider and apiKey are required",
          );
        }

        if (!validateKeyFormat(provider, apiKey)) {
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            `Invalid API key format for ${provider}`,
          );
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
        logTraceback(log, "Failed to create key", error, {
          userId: req.user?.id,
          provider: req.body?.provider,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to store API key");
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
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            "Provider and apiKey are required",
          );
        }

        if (!validateKeyFormat(provider, apiKey)) {
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            `Invalid API key format for ${provider}`,
          );
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
            return fail(
              req,
              res,
              "VALIDATION_FAILED",
              `Unsupported provider: ${provider}`,
            );
          }
        } catch (validationErr: unknown) {
          logTraceback(log, "Key validation call failed", validationErr, {
            provider,
            requestId: req.requestId ?? "unscoped",
          });
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
        logTraceback(log, "Failed to test key", error, {
          provider: req.body?.provider,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to test API key");
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
          return fail(req, res, "NOT_FOUND", "API key not found");
        }

        res.json({ success: true });
      } catch (error) {
        logTraceback(log, "Failed to delete key", error, {
          userId: req.user?.id,
          keyId: req.params.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to delete API key");
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
      let providerAbortScope: ProviderAbortScope | undefined;
      try {
        const userId = req.user!.id;
        const {
          provider,
          model,
          messages,
          temperature,
          maxTokens,
          stream,
          tools,
        } = req.body as {
          provider?: string;
          model?: string;
          messages: {
            role: "user" | "assistant" | "system" | "tool";
            content?: string | null;
            name?: string;
            tool_call_id?: string;
            tool_calls?: any[];
          }[];
          temperature?: number;
          maxTokens?: number;
          stream?: boolean;
          tools?: any[];
        };

        if (!messages || !Array.isArray(messages)) {
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            "messages array is required",
          );
        }
        const boundedMaxTokens = Math.min(
          MAX_CHAT_TOKENS,
          Math.max(
            1,
            Number.isFinite(maxTokens)
              ? Math.floor(maxTokens!)
              : DEFAULT_CHAT_TOKENS,
          ),
        );

        const start = process.hrtime();

        let resolved;
        try {
          resolved = await resolveProviderForRequest(userId, provider, model);
        } catch (error) {
          if (error instanceof ProviderResolutionError) {
            return handleResolutionError(error, req, res);
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

        providerAbortScope = createProviderAbortScope(req, res);
        const providerRequest = {
          model: resolvedModel,
          messages,
          temperature,
          maxTokens: boundedMaxTokens,
          tools,
          signal: providerAbortScope.signal,
        };

        if (resolvedProvider === "gemini") {
          const { createGeminiChatCompletion, streamGeminiChatCompletion } =
            await import("../providers/gemini");

          if (stream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const sseStream = streamGeminiChatCompletion(apiKey, {
              ...providerRequest,
              stream: true,
            });

            for await (const chunk of sseStream) {
              if (typeof chunk === "string") {
                if (!writeSse(res, { content: chunk })) break;
              } else {
                if (!writeSse(res, chunk)) break;
              }
            }

            if (!providerAbortScope.signal.aborted && !res.writableEnded) {
              res.write("data: [DONE]\n\n");
              res.end();
            }
          } else {
            const response = await createGeminiChatCompletion(apiKey, {
              ...providerRequest,
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
              ...providerRequest,
              stream: true,
            });

            for await (const chunk of sseStream) {
              if (!writeSse(res, { content: chunk })) break;
            }

            if (!providerAbortScope.signal.aborted && !res.writableEnded) {
              res.write("data: [DONE]\n\n");
              res.end();
            }
          } else {
            const response = await createOpenAIChatCompletion(apiKey, {
              ...providerRequest,
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
              ...providerRequest,
              stream: true,
            });

            for await (const chunk of sseStream) {
              if (!writeSse(res, { content: chunk })) break;
            }

            if (!providerAbortScope.signal.aborted && !res.writableEnded) {
              res.write("data: [DONE]\n\n");
              res.end();
            }
          } else {
            const response = await createAnthropicChatCompletion(apiKey, {
              ...providerRequest,
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
              ...providerRequest,
              stream: true,
            });

            for await (const chunk of sseStream) {
              if (!writeSse(res, { content: chunk })) break;
            }

            if (!providerAbortScope.signal.aborted && !res.writableEnded) {
              res.write("data: [DONE]\n\n");
              res.end();
            }
          } else {
            const response = await createOpenRouterChatCompletion(apiKey, {
              ...providerRequest,
              stream: false,
            });
            res.json(response);
          }
        } else {
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            `Unsupported provider: ${resolvedProvider}`,
          );
        }
      } catch (error: unknown) {
        const reason = abortReason(providerAbortScope?.signal);
        if (reason instanceof ClientDisconnectedError) {
          log.info({ userId: req.user?.id }, "AI request cancelled by client");
          return;
        }

        const requestId = req.requestId ?? "unscoped";
        logTraceback(log, "Chat completion failed", error, {
          userId: req.user?.id,
          requestId,
        });

        const providerError = error as {
          status?: number;
          statusCode?: number;
          message?: string;
        };
        const statusCode =
          reason instanceof ProviderTimeoutError
            ? reason.status
            : (providerError.status ?? providerError.statusCode ?? 502);
        // Raw provider text stays in the logs — clients get a stable code
        // plus the request ID. (Timeout text is ours and safe to forward.)
        const message =
          reason instanceof ProviderTimeoutError
            ? reason.message
            : "AI provider returned an error. Quote the request ID to support.";
        const upstreamRateLimited = statusCode === 429;
        const publicCode = upstreamRateLimited
          ? ("RATE_LIMITED" as const)
          : ("PROVIDER_ERROR" as const);
        if (res.headersSent) {
          if (!res.writableEnded && !res.destroyed) {
            writeSse(res, { code: publicCode, message, requestId }, "error");
            res.end();
          }
          return;
        }
        res
          .status(
            upstreamRateLimited
              ? 429
              : statusCode >= 400 && statusCode < 600
                ? statusCode
                : 502,
          )
          .json({
            code: publicCode,
            message,
            requestId,
          });
      } finally {
        providerAbortScope?.dispose();
      }
    },
  );

  // Generate suggestions
  router.post(
    "/suggestions",
    isAuthenticated,
    conditionalCsrf,
    aiChatLimiter,
    async (req: Request, res: Response) => {
      let providerAbortScope: ProviderAbortScope | undefined;
      try {
        const userId = req.user!.id;
        const { canvas } = req.body as {
          canvas?: { nodes?: CanvasNode[]; edges?: CanvasEdge[] };
        };
        const canvasNodes: CanvasNode[] = Array.isArray(canvas?.nodes)
          ? canvas.nodes
          : [];
        const canvasEdges: CanvasEdge[] = Array.isArray(canvas?.edges)
          ? canvas.edges
          : [];
        // Suggestions should be cheap hints, never a way to turn a large
        // document into an unbounded provider prompt.
        if (canvasNodes.length > 100 || canvasEdges.length > 150) {
          return fail(
            req,
            res,
            "CANVAS_TOO_LARGE",
            "Canvas is too large for AI suggestions. Split it or slim it below 100 nodes / 150 edges.",
          );
        }

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
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            `Unsupported provider for suggestions: ${provider}`,
          );
        }

        const prompt = `You are Jenkos, the expert cloud architecture co-pilot for Meshwork Studio. 
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
        providerAbortScope = createProviderAbortScope(req, res);
        const suggestionRequest = {
          model: suggestionsModel,
          messages: [{ role: "user" as const, content: prompt }],
          temperature: 0.5,
          maxTokens: 80,
          stream: false,
          signal: providerAbortScope.signal,
        };

        if (provider === "gemini") {
          const { createGeminiChatCompletion } =
            await import("../providers/gemini");
          const response = (await createGeminiChatCompletion(
            apiKey,
            suggestionRequest,
          )) as ChatCompletionResponse;
          responseText = response.choices?.[0]?.message?.content ?? "";
        } else if (provider === "openrouter") {
          const { createOpenRouterChatCompletion } =
            await import("../providers/openrouter");
          const response = (await createOpenRouterChatCompletion(
            apiKey,
            suggestionRequest,
          )) as ChatCompletionResponse;
          responseText = response.choices?.[0]?.message?.content ?? "";
        } else if (provider === "openai") {
          const { createOpenAIChatCompletion } =
            await import("../providers/openai");
          const response = (await createOpenAIChatCompletion(
            apiKey,
            suggestionRequest,
          )) as ChatCompletionResponse;
          responseText = response.choices?.[0]?.message?.content ?? "";
        } else if (provider === "anthropic") {
          const { createAnthropicChatCompletion } =
            await import("../providers/anthropic");
          const response = await createAnthropicChatCompletion(
            apiKey,
            suggestionRequest,
          );
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
        if (
          abortReason(providerAbortScope?.signal) instanceof
          ClientDisconnectedError
        ) {
          return;
        }
        logTraceback(log, "Suggestions failed", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        return res.json([
          "Design a scalable Kubernetes microservices architecture",
          "Set up a high-availability Postgres cluster",
          "Build a serverless event-driven data pipeline",
          "Create a secure AWS VPC with public/private subnets",
        ]);
      } finally {
        providerAbortScope?.dispose();
      }
    },
  );

  // ─── Conversations API ──────────────────────────────────────────────────────

  // List conversations
  router.get(
    "/conversations",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const workspaceId = req.query.workspaceId as string | undefined;
        const scope = req.query.scope as string | undefined;

        const list = await getConversations(userId, { workspaceId, scope });
        res.json(list);
      } catch (error) {
        logTraceback(log, "Failed to list conversations", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to list conversations");
      }
    },
  );

  // Create conversation
  router.post(
    "/conversations",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const parsed = insertConversationSchema.parse({
          ...req.body,
          userId,
        });

        const created = await createConversation(parsed);
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof ZodError) {
          return fail(req, res, "VALIDATION_FAILED", firstIssueMessage(error), {
            issues: zodIssues(error),
          });
        }
        logTraceback(log, "Failed to create conversation", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to create conversation");
      }
    },
  );

  // Get single conversation
  router.get(
    "/conversations/:id",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const conversation = await getConversationById(conversationId, userId);

        if (!conversation) {
          return fail(req, res, "NOT_FOUND", "Conversation not found");
        }

        res.json(conversation);
      } catch (error) {
        logTraceback(log, "Failed to get conversation", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to get conversation");
      }
    },
  );

  // Update conversation
  router.patch(
    "/conversations/:id",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const updated = await updateConversation(
          conversationId,
          userId,
          req.body,
        );

        if (!updated) {
          return fail(req, res, "NOT_FOUND", "Conversation not found");
        }

        res.json(updated);
      } catch (error) {
        logTraceback(log, "Failed to update conversation", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to update conversation");
      }
    },
  );

  // Delete conversation
  router.delete(
    "/conversations/:id",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const deleted = await deleteConversation(conversationId, userId);

        if (!deleted) {
          return fail(req, res, "NOT_FOUND", "Conversation not found");
        }

        res.json({ success: true });
      } catch (error) {
        logTraceback(log, "Failed to delete conversation", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to delete conversation");
      }
    },
  );

  // Get messages for conversation
  router.get(
    "/conversations/:id/messages",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const conversation = await getConversationById(conversationId, userId);

        if (!conversation) {
          return fail(req, res, "NOT_FOUND", "Conversation not found");
        }

        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : 100;
        const messageList = await getMessagesByConversationId(
          conversationId,
          limit,
        );
        res.json(messageList);
      } catch (error) {
        logTraceback(log, "Failed to get messages", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to get messages");
      }
    },
  );

  // Create message in conversation
  router.post(
    "/conversations/:id/messages",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const conversation = await getConversationById(conversationId, userId);

        if (!conversation) {
          return fail(req, res, "NOT_FOUND", "Conversation not found");
        }

        const parsed = insertMessageSchema.parse({
          ...req.body,
          conversationId,
        });

        const created = await createMessage(parsed);
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof ZodError) {
          return fail(req, res, "VALIDATION_FAILED", firstIssueMessage(error), {
            issues: zodIssues(error),
          });
        }
        logTraceback(log, "Failed to create message", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to create message");
      }
    },
  );

  // ─── Memories API ───────────────────────────────────────────────────────────

  // Get memories
  router.get(
    "/memories",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const workspaceId = req.query.workspaceId as string | undefined;
        const scope = req.query.scope as string | undefined;
        const category = req.query.category as string | undefined;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : 50;

        const memoryList = await getMemories(userId, {
          workspaceId,
          scope,
          category,
          limit,
        });
        res.json(memoryList);
      } catch (error) {
        logTraceback(log, "Failed to list memories", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to list memories");
      }
    },
  );

  // Search memories
  router.get(
    "/memories/search",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const query = req.query.q as string;
        const workspaceId = req.query.workspaceId as string | undefined;

        if (!query) {
          return fail(
            req,
            res,
            "VALIDATION_FAILED",
            "Search query 'q' is required",
          );
        }

        const results = await searchMemories(userId, query, { workspaceId });
        res.json(results);
      } catch (error) {
        logTraceback(log, "Failed to search memories", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to search memories");
      }
    },
  );

  // Create memory
  router.post(
    "/memories",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const parsed = insertMemorySchema.parse({
          ...req.body,
          userId,
        });

        const created = await createMemory(parsed);
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof ZodError) {
          return fail(req, res, "VALIDATION_FAILED", firstIssueMessage(error), {
            issues: zodIssues(error),
          });
        }
        logTraceback(log, "Failed to create memory", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to create memory");
      }
    },
  );

  // Recall / touch memory
  router.post(
    "/memories/:id/recall",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const memoryId = req.params.id as string;
        const memory = await recallMemory(memoryId, userId);

        if (!memory) {
          return fail(req, res, "NOT_FOUND", "Memory not found");
        }

        res.json(memory);
      } catch (error) {
        logTraceback(log, "Failed to recall memory", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to recall memory");
      }
    },
  );

  // Delete memory
  router.delete(
    "/memories/:id",
    isAuthenticated,
    conditionalCsrf,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const memoryId = req.params.id as string;
        const deleted = await deleteMemory(memoryId, userId);

        if (!deleted) {
          return fail(req, res, "NOT_FOUND", "Memory not found");
        }

        res.json({ success: true });
      } catch (error) {
        logTraceback(log, "Failed to delete memory", error, {
          userId: req.user?.id,
          requestId: req.requestId ?? "unscoped",
        });
        fail(req, res, "AI_UNAVAILABLE", "Failed to delete memory");
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
