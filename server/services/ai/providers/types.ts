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

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDeclaration[];
  tool_choice?: string | object;
}
