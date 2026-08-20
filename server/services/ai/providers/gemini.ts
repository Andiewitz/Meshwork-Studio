import OpenAI from "openai";
import type { ChatCompletionRequest } from "./types";

export * from "./types";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gemini Provider Handler
 * Uses Google's OpenAI-compatible endpoint with automatic retry for rate limits
 */
export async function createGeminiChatCompletion(
  apiKey: string,
  request: ChatCompletionRequest,
): Promise<ReadableStream | object> {
  const openai = new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: request.model || "gemini-2.5-flash",
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: request.stream ?? false,
      });

      return response;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.statusCode;
      const isRetryable = status === 429 || (status >= 500 && status < 600);

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

/**
 * Gemini Streaming Chat Completion
 */
export async function* streamGeminiChatCompletion(
  apiKey: string,
  request: ChatCompletionRequest,
): AsyncGenerator<string, void, unknown> {
  const openai = new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });

  let stream: any;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      stream = await openai.chat.completions.create({
        model: request.model || "gemini-2.5-flash",
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      });
      break;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.statusCode;
      const isRetryable = status === 429 || (status >= 500 && status < 600);

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  if (!stream) {
    throw lastError;
  }

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

/**
 * Validate Gemini API Key
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
