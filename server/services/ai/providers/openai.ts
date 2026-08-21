import OpenAI from "openai";
import type { ChatCompletionRequest } from "./types";

export async function createOpenAIChatCompletion(
  apiKey: string,
  request: ChatCompletionRequest,
): Promise<ReadableStream | object> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: request.model,
    messages: request.messages as any,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens,
    stream: request.stream ?? false,
    ...(request.tools ? { tools: request.tools } : {}),
  });

  return response;
}

export async function* streamOpenAIChatCompletion(
  apiKey: string,
  request: ChatCompletionRequest,
): AsyncGenerator<string, void, unknown> {
  const openai = new OpenAI({ apiKey });

  const stream = await openai.chat.completions.create({
    model: request.model,
    messages: request.messages as any,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens,
    stream: true,
    ...(request.tools ? { tools: request.tools } : {}),
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

export async function validateOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({ apiKey });
    await openai.models.list();
    return true;
  } catch (_error) {
    return false;
  }
}

export const openAIModels = [
  { id: "gpt-4", name: "GPT-4" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
];
