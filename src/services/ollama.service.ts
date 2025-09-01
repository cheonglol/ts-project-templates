import type { AxiosError, AxiosInstance } from "axios";
import AxiosClient from "../class/common/axios-client.class";
import { Response } from "../class/common/response.class";
import {
  IOllamaChatMessage,
  IOllamaChatRequest,
  IOllamaChatResponse,
  IOllamaEmbedRequest,
  IOllamaEmbedResponse,
  IOllamaGenerateOptions,
  IOllamaGenerateResponse,
  IOllamaGenerateResult,
} from "../interfaces/ollama.interface";
import { IStandardResponseBody } from "../interfaces/transport.interface";
import { EnvVarKeys } from "../modules/env-validation.module";
import { handleAxiosError, toStandardResponse } from "../utils/response-utils";
import logger from "src/logging";

const DEFAULT_OLLAMA_BASE = process.env[EnvVarKeys.OLLAMA_SERVICE_URL];

class OllamaService {
  // Lazily obtain Axios instance so tests can mock AxiosClient.getInstance before module methods are called
  private get axios(): AxiosInstance {
    return AxiosClient.getInstance({ baseURL: DEFAULT_OLLAMA_BASE, timeout: 30000 });
  }

  // Small contract for public methods
  // - Inputs validated minimally
  // - Outputs wrapped in IStandardResponseBody

  public async generate(body: IOllamaGenerateOptions): Promise<IStandardResponseBody<IOllamaGenerateResult>> {
    if (!body?.model) {
      return { success: false, msg: "model is required", payload: { results: [] } as IOllamaGenerateResult };
    }

    try {
      // small helper to safely parse JSON strings
      const parseJson = <T = unknown>(s: unknown): T | undefined => {
        if (typeof s !== "string") return undefined;
        try {
          return JSON.parse(s) as T;
        } catch (err) {
          logger.debug("parseJson failed", (err as Error)?.message ?? String(err));
          return undefined;
        }
      };

      if (body.stream) {
        const resp = await this.axios.post("/api/generate", body, {
          responseType: "stream",
          // Accept text/event-stream or chunked JSON
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream, */*" },
        });

        const stream = resp.data as NodeJS.ReadableStream;
        const results: IOllamaGenerateResponse[] = [];

        await new Promise<void>((resolve, reject) => {
          let buf = "";
          const onData = (chunk: Buffer | string) => {
            buf += chunk.toString("utf8");
            // split on newline which is common for NDJSON or chunked JSON
            const parts = buf.split(/\r?\n/);
            buf = parts.pop() || "";
            for (const p of parts) {
              const s = p.trim();
              if (!s) continue;
              try {
                const parsed = JSON.parse(s) as IOllamaGenerateResponse;
                // attach structured parsed JSON if response is a JSON string
                const structured = parseJson((parsed as IOllamaGenerateResponse).response);
                if (structured !== undefined) {
                  (parsed as IOllamaGenerateResponse & { structured?: unknown }).structured = structured;
                }
                results.push(parsed);
                // If server marks done or provides final response, end early
                if ((parsed as IOllamaGenerateResponse).done === true || typeof (parsed as IOllamaGenerateResponse).response === "string") {
                  // stop reading further
                  try {
                    (stream as any).destroy?.();
                  } catch (err) {
                    logger.debug("stream destroy failed", String(err));
                  }
                  resolve();
                  return;
                }
              } catch (err) {
                logger.debug("OllamaService.generate stream parse error", (err as Error)?.message ?? String(err));
              }
            }
          };

          stream.on("data", onData);
          stream.on("end", () => {
            // try parse any remaining buffer
            const s = buf.trim();
            if (s) {
              try {
                const parsed = JSON.parse(s) as IOllamaGenerateResponse;
                const structured = parseJson((parsed as IOllamaGenerateResponse).response);
                if (structured !== undefined) (parsed as IOllamaGenerateResponse & { structured?: unknown }).structured = structured;
                results.push(parsed);
              } catch (err) {
                logger.debug("OllamaService.generate end parse error", (err as Error)?.message ?? String(err));
              }
            }
            resolve();
          });
          stream.on("error", (err) => reject(err));
        });

        return { success: true, msg: "ok", payload: { results } as IOllamaGenerateResult };
      }

      // Non-streaming JSON response
      const resp = await this.axios.post<IOllamaGenerateResponse | IOllamaGenerateResponse[]>("/api/generate", body, {
        headers: { "Content-Type": "application/json" },
        timeout: 120000, // allow longer for non-stream requests (models may need time to load)
      });

      // normalize to an array of results for consistent consumers
      const raw = resp.data;
      const data: IOllamaGenerateResponse[] = Array.isArray(raw) ? (raw as IOllamaGenerateResponse[]) : [raw as IOllamaGenerateResponse];
      // parse structured JSON from response string when possible
      for (const r of data) {
        const structured = parseJson((r as IOllamaGenerateResponse).response);
        if (structured !== undefined) (r as IOllamaGenerateResponse & { structured?: unknown }).structured = structured;
      }
      return { success: true, msg: "ok", payload: { results: data } as IOllamaGenerateResult };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.generate");
      return toStandardResponse(resp);
    }
  }

  public async chat(body: IOllamaChatRequest): Promise<IStandardResponseBody<IOllamaChatResponse>> {
    if (!body?.model) {
      return { success: false, msg: "model is required", payload: { messages: [] } };
    }

    try {
      // capture any conversation context the server may return
      let returnedContext: unknown = undefined;

      // helper to parse JSON safely and log failures at debug level
      const parseJson = <T = unknown>(s: unknown): T | undefined => {
        if (typeof s !== "string") return undefined;
        try {
          return JSON.parse(s) as T;
        } catch (err) {
          logger.debug("parseJson failed", String(err));
          return undefined;
        }
      };

      // helper to normalize and push a raw message-like object into messages
      const processRawMessage = (raw: unknown, messages: IOllamaChatMessage[]) => {
        if (!raw || typeof raw !== "object") return;
        const msg = raw as IOllamaChatMessage;
        const responseContent = (msg.content ?? (raw as Record<string, unknown>)["response"]) as unknown;
        const structured = parseJson(responseContent);
        if (structured !== undefined) (msg as unknown as { structured?: unknown }).structured = structured;
        const msgContext = (raw as Record<string, unknown>)["context"];
        if (msgContext !== undefined) returnedContext = msgContext;
        messages.push(msg);
      };

      if (body.stream) {
        const resp = await this.axios.post("/api/chat", body, {
          responseType: "stream",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream, */*" },
        });
        const stream = resp.data as NodeJS.ReadableStream & { destroy?: () => void };
        const messages: IOllamaChatMessage[] = [];

        await new Promise<void>((resolve, reject) => {
          let buf = "";
          const onData = (chunk: Buffer | string) => {
            buf += chunk.toString("utf8");
            const parts = buf.split(/\r?\n/);
            buf = parts.pop() || "";
            for (const p of parts) {
              const s = p.trim();
              if (!s) continue;
              try {
                const parsed = JSON.parse(s) as Record<string, unknown>;
                if (parsed["context"] !== undefined) returnedContext = parsed["context"];
                if (Array.isArray(parsed["messages"])) {
                  for (const m of parsed["messages"] as unknown[]) processRawMessage(m, messages);
                } else if (parsed["message"]) {
                  processRawMessage(parsed["message"], messages);
                }
                if (parsed["done"] === true || parsed["message"]) {
                  try {
                    stream.destroy?.();
                  } catch (err) {
                    logger.debug("stream destroy failed", String(err));
                  }
                  resolve();
                  return;
                }
              } catch (err) {
                logger.debug("OllamaService.chat stream chunk parse failed", String(err));
              }
            }
          };

          stream.on("data", onData);
          stream.on("end", () => {
            const s = buf.trim();
            if (s) {
              try {
                const parsed = JSON.parse(s) as Record<string, unknown>;
                if (parsed["context"] !== undefined) returnedContext = parsed["context"];
                if (Array.isArray(parsed["messages"])) {
                  for (const m of parsed["messages"] as unknown[]) processRawMessage(m, messages);
                } else if (parsed["message"]) {
                  processRawMessage(parsed["message"], messages);
                }
              } catch (err) {
                logger.debug("OllamaService.chat stream end parse failed", String(err));
              }
            }
            resolve();
          });
          stream.on("error", (err) => reject(err));
        });

        return { success: true, msg: "ok", payload: { messages, context: returnedContext } };
      }

      const resp = await this.axios.post<unknown>("/api/chat", body, { headers: { "Content-Type": "application/json" }, timeout: 120000 });
      const data = resp.data as unknown;
      const messages: IOllamaChatMessage[] = [];

      if (data != null) {
        if (typeof data === "string") {
          const structured = parseJson(data);
          const m: IOllamaChatMessage = { role: "assistant", content: data };
          if (structured !== undefined) (m as unknown as { structured?: unknown }).structured = structured;
          messages.push(m);
        } else if (typeof data === "object") {
          const obj = data as Record<string, unknown>;
          if (obj["context"] !== undefined) returnedContext = obj["context"];
          if (Array.isArray(obj["messages"])) {
            for (const raw of obj["messages"] as unknown[]) processRawMessage(raw, messages);
          } else if (obj["message"]) {
            processRawMessage(obj["message"], messages);
          } else if (typeof obj["response"] === "string") {
            const structured = parseJson(obj["response"]);
            const m: IOllamaChatMessage = { role: "assistant", content: obj["response"] as string };
            if (structured !== undefined) (m as unknown as { structured?: unknown }).structured = structured;
            messages.push(m);
          }
        }
      }

      return { success: true, msg: "ok", payload: { messages, context: returnedContext } };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.chat");
      return toStandardResponse(resp);
    }
  }

  public async embed(body: IOllamaEmbedRequest): Promise<IStandardResponseBody<IOllamaEmbedResponse>> {
    if (!body?.model || body.input == null) {
      return { success: false, msg: "model and input are required", payload: { embeddings: [] } };
    }

    try {
      const resp = await this.axios.post<unknown>("/api/embed", body, { headers: { "Content-Type": "application/json" } });
      const responseData = resp.data as unknown;
      const isEmbedResponse = (value: unknown): value is { embeddings: number[][] } => {
        if (typeof value !== "object" || value === null) return false;
        const maybe = (value as Record<string, unknown>)["embeddings"];
        if (!Array.isArray(maybe)) return false;
        return maybe.every((row) => Array.isArray(row) && row.every((n) => typeof n === "number"));
      };
      const finalPayload = isEmbedResponse(responseData) ? { embeddings: responseData.embeddings } : { embeddings: [] };
      return { success: true, msg: "ok", payload: finalPayload };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.embed");
      return toStandardResponse(resp);
    }
  }

  public async tags(): Promise<IStandardResponseBody<unknown>> {
    try {
      const resp = await this.axios.get<unknown>("/api/tags");
      return { success: true, msg: "ok", payload: resp.data };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.tags");
      return toStandardResponse(resp);
    }
  }

  public async ps(): Promise<IStandardResponseBody<unknown>> {
    try {
      const resp = await this.axios.get<unknown>("/api/ps");
      return { success: true, msg: "ok", payload: resp.data };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.ps");
      return toStandardResponse(resp);
    }
  }

  public async version(): Promise<IStandardResponseBody<unknown>> {
    try {
      const resp = await this.axios.get<unknown>("/api/version");
      return { success: true, msg: "ok", payload: resp.data };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.version");
      return toStandardResponse(resp);
    }
  }

  // Generic run for endpoints that stream status messages and return array of objects
  public async createModel(payload: unknown): Promise<IStandardResponseBody<unknown>> {
    try {
      const resp = await this.axios.post<unknown>("/api/create", payload, { headers: { "Content-Type": "application/json" } });
      return { success: true, msg: "ok", payload: resp.data };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.createModel");
      return toStandardResponse(resp);
    }
  }

  // push/pull/show/delete/copy endpoints are thin wrappers
  public async show(model: string, verbose = false): Promise<IStandardResponseBody<unknown>> {
    if (!model) return { success: false, msg: "model is required", payload: {} };
    try {
      const resp = await this.axios.post<unknown>("/api/show", { model, verbose }, { headers: { "Content-Type": "application/json" } });
      return { success: true, msg: "ok", payload: resp.data };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.show");
      return toStandardResponse(resp);
    }
  }

  public async pull(model: string, insecure = false): Promise<IStandardResponseBody<unknown>> {
    if (!model) return { success: false, msg: "model is required", payload: {} };
    try {
      const resp = await this.axios.post<unknown>("/api/pull", { model, insecure }, { headers: { "Content-Type": "application/json" } });
      return { success: true, msg: "ok", payload: resp.data };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.pull");
      return toStandardResponse(resp);
    }
  }

  public async deleteModel(model: string): Promise<IStandardResponseBody<unknown>> {
    if (!model) return { success: false, msg: "model is required", payload: {} };
    try {
      const resp = await this.axios.delete<unknown>("/api/delete", { data: { model }, headers: { "Content-Type": "application/json" } });
      return { success: true, msg: "ok", payload: resp.data };
    } catch (err) {
      const axiosErr = err as unknown as AxiosError;
      const resp: Response = handleAxiosError(axiosErr, "OllamaService.deleteModel");
      return toStandardResponse(resp);
    }
  }
}

export default new OllamaService();
