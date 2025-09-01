/**
 * Interfaces for the Ollama API shapes used by the service.
 * Prefer explicit interfaces so they're extendable and easy to mock in tests.
 */

export interface IOllamaGenerateOptions {
  model: string;
  prompt?: string;
  suffix?: string;
  images?: string[];
  think?: boolean;
  stream?: boolean;
  format?: unknown;
  options?: Record<string, unknown>;
  raw?: boolean;
  keep_alive?: string | number;
}

export interface IOllamaGenerateResponse {
  model: string;
  created_at?: string;
  response?: string;
  /** If Ollama returned a JSON string and we could parse it, this will be the parsed object */
  structured?: unknown;
  done?: boolean;
  done_reason?: string;
  context?: unknown;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface IOllamaGenerateResult {
  results: IOllamaGenerateResponse[];
}

export interface IOllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  /** parsed structured content when the message contains JSON */
  structured?: unknown;
  images?: string[] | null;
  thinking?: string | null;
}

export interface IOllamaChatRequest {
  model: string;
  messages?: IOllamaChatMessage[];
  tools?: unknown[];
  stream?: boolean;
  options?: Record<string, unknown>;
  keep_alive?: string | number;
  /** optional conversation context encoding returned by previous responses */
  context?: unknown;
}

export interface IOllamaChatResponse {
  messages?: IOllamaChatMessage[];
  /** optional conversation context returned by the server */
  context?: unknown;
}

export interface IOllamaEmbedRequest {
  model: string;
  input: string | string[];
  truncate?: boolean;
  options?: Record<string, unknown>;
  keep_alive?: string | number;
}

export interface IOllamaEmbedResponse {
  embeddings?: number[][];
}
