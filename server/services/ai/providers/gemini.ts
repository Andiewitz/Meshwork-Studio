import type { ChatCompletionRequest } from "./types";

export * from "./types";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const BACKUP_GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
];

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeModelName(model?: string): string {
  if (!model) return DEFAULT_GEMINI_MODEL;
  // If model was legacy gemini-2.0-flash or gemini-2.5-flash-lite which are unavailable
  if (
    model.includes("gemini-2.0") ||
    model.includes("gemini-1.5") ||
    model.includes("2.5-flash-lite")
  ) {
    return DEFAULT_GEMINI_MODEL;
  }
  return model.replace(/^models\//, "");
}

function buildGeminiPayload(request: ChatCompletionRequest) {
  const systemMsg = request.messages.find((m) => m.role === "system");
  const contents = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        },
      ],
    }));

  const payload: Record<string, any> = {
    contents:
      contents.length > 0
        ? contents
        : [{ role: "user", parts: [{ text: "Hello" }] }],
  };

  if (systemMsg?.content) {
    payload.system_instruction = {
      parts: [
        {
          text:
            typeof systemMsg.content === "string"
              ? systemMsg.content
              : JSON.stringify(systemMsg.content),
        },
      ],
    };
  }

  const generationConfig: Record<string, any> = {};
  if (typeof request.temperature === "number") {
    generationConfig.temperature = request.temperature;
  }
  if (typeof request.maxTokens === "number" && request.maxTokens > 0) {
    generationConfig.maxOutputTokens = request.maxTokens;
  }
  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig;
  }

  return payload;
}

/**
 * Native Gemini Non-Streaming Chat Completion via REST API
 */
export async function createGeminiChatCompletion(
  apiKey: string,
  request: ChatCompletionRequest,
): Promise<object> {
  const initialModel = sanitizeModelName(request.model);
  const modelsToTry = [
    initialModel,
    ...BACKUP_GEMINI_MODELS.filter((m) => m !== initialModel),
  ];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const payload = buildGeminiPayload(request);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errorMsg =
            errData?.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`;
          const err = new Error(errorMsg);
          (err as any).status = response.status;
          (err as any).code = errData?.error?.code;

          // If rate-limited or transient, retry or fall back to next model
          if (response.status === 429 || response.status === 503) {
            if (attempt < MAX_RETRIES) {
              await sleep(BASE_RETRY_DELAY_MS * (attempt + 1));
              continue;
            }
            // Move to next backup model
            lastError = err;
            break;
          }

          if (response.status === 404) {
            // Model deprecated or not found, try next backup model
            lastError = err;
            break;
          }

          throw err;
        }

        const data: any = await response.json();
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const text = parts.map((p: any) => p.text || "").join("");

        return {
          id: `gemini-${Date.now()}`,
          object: "chat.completion",
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: text,
              },
              finish_reason: candidate?.finishReason || "stop",
            },
          ],
          usage: {
            prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
            completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: data.usageMetadata?.totalTokenCount || 0,
          },
        };
      } catch (err: any) {
        lastError = err;
        if (err.status === 429 || err.status === 503 || err.status === 404) {
          break; // Try next model in loop
        }
        throw err;
      }
    }
  }

  throw lastError || new Error("Failed to generate content with Gemini models");
}

/**
 * Native Gemini Streaming Chat Completion via REST SSE
 */
export async function* streamGeminiChatCompletion(
  apiKey: string,
  request: ChatCompletionRequest,
): AsyncGenerator<string, void, unknown> {
  const initialModel = sanitizeModelName(request.model);
  const modelsToTry = [
    initialModel,
    ...BACKUP_GEMINI_MODELS.filter((m) => m !== initialModel),
  ];

  let streamBody: ReadableStream<Uint8Array> | null = null;
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const payload = buildGeminiPayload(request);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok && response.body) {
        streamBody = response.body;
        break;
      } else {
        const errData = await response.json().catch(() => ({}));
        const errorMsg =
          errData?.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        const err = new Error(errorMsg);
        (err as any).status = response.status;
        lastError = err;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  if (!streamBody) {
    throw (
      lastError || new Error("Failed to open streaming connection to Gemini")
    );
  }

  const reader = streamBody.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === "[DONE]") return;
          try {
            const parsed = JSON.parse(jsonStr);
            const candidate = parsed.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            const text = parts.map((p: any) => p.text || "").join("");
            if (text) {
              yield text;
            }
          } catch {
            // Ignore partial SSE JSON parse errors
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Validate Gemini API Key using native endpoint
 */
export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    return response.ok;
  } catch {
    return false;
  }
}
