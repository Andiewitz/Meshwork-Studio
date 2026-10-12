export interface ToolFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

export interface ToolDeclaration {
  type: "function";
  function: ToolFunctionDeclaration;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * Our wire format matches the OpenAI chat schema field-for-field (roles,
 * content, tool_calls, tool_call_id). The single boundary assertion keeps
 * `any` out of every provider call site; if the SDK type drifts, tsc fails
 * here instead of silently at runtime.
 */
export type OpenAIMessageParams =
  import("openai/resources/chat/completions").ChatCompletionMessageParam[];

export function toMessageParams(messages: ChatMessage[]): OpenAIMessageParams {
  return messages as unknown as OpenAIMessageParams;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDeclaration[];
  tool_choice?: string | object;
  /** Cancels the upstream request when the caller disconnects or times out. */
  signal?: AbortSignal;
}
