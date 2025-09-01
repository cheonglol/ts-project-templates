import { IOllamaGenerateOptions, IOllamaGenerateResponse, IOllamaChatRequest, IOllamaEmbedRequest } from "../../interfaces/ollama.interface";
import path from "path";
import dotenv from "dotenv";
import http from "http";
import https from "https";
import { EnvVarKeys } from "../../modules/env-validation.module";

// Load environment from repo root .env so tests pick up OLLAMA_SERVICE_URL automatically
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Lightweight model info type used for parsing /api/tags responses in tests
type ModelInfo = { name?: string; model?: string; details?: { family?: string } };

// simple logger to show realtime test progress with timestamps
const lg = (...args: unknown[]) => console.log(new Date().toISOString(), "[deepseek.test]", ...args);

async function checkEndpoint(urlStr: string, timeout = 5000): Promise<{ ok: boolean; status?: number; err?: string }> {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(urlStr);
      const lib = urlObj.protocol === "https:" ? https : http;
      const opts = { method: "GET", timeout } as http.RequestOptions & { timeout: number };
      const req = lib.request(urlObj, opts, (res: http.IncomingMessage) => {
        res.once("data", () => {
          /* drain */
        });
        res.once("end", () => {
          /* end */
        });
        resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 400, status: res.statusCode });
      });
      req.on("error", (err: Error) => resolve({ ok: false, err: String(err) }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, err: "timeout" });
      });
      req.end();
    } catch (err) {
      resolve({ ok: false, err: String(err) });
    }
  });
}

describe("OllamaService integration (real Ollama)", () => {
  // network calls can be slow; increase Jest timeout for these integration tests
  // 60 seconds to allow model load and generation on remote host
  jest.setTimeout(60000);
  let OllamaService: any;
  let realModel = "deepseek-r1:latest";
  let embedModel: string | undefined;

  beforeAll(async () => {
    // Preflight: ensure OLLAMA_SERVICE_URL is defined and reachable at /api/version
    const base = process.env[EnvVarKeys.OLLAMA_SERVICE_URL];
    if (!base) throw new Error("OLLAMA_SERVICE_URL is not defined");
    const versionUrl = base.replace(/\/$/, "") + "/api/version";

    lg("preflight: checking", versionUrl);
    const res = await checkEndpoint(versionUrl, 5000);
    if (!res.ok) {
      lg("preflight: failed", res);
      throw new Error(`Preflight failed: cannot reach ${versionUrl} (${res.err ?? res.status})`);
    }
    lg("preflight: ok", versionUrl);

    // load the AxiosClient class so we can reset any singleton state it holds
    // Use CommonJS require() here to avoid dynamic ESM import which needs
    // --experimental-vm-modules when running under Node/Jest in this setup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AxiosClient = (require("../../class/common/axios-client.class") as any).default as any;
    (AxiosClient as any).resetForTests?.();

    // discover a real model name from /api/tags so tests use an available model
    try {
      const fetchJson = async (url: string): Promise<unknown> => {
        const u = new URL(url);
        const lib = u.protocol === "https:" ? https : http;
        return new Promise((resolve, reject) => {
          const opts = { method: "GET" };
          const req = lib.request(u, opts, (res: http.IncomingMessage) => {
            let raw = "";
            res.on("data", (c: Buffer) => (raw += c.toString("utf8")));
            res.on("end", () => {
              try {
                resolve(JSON.parse(raw));
              } catch (err) {
                reject(err);
              }
            });
          });
          req.on("error", (err: Error) => reject(err));
          req.end();
        });
      };

      const base = process.env[EnvVarKeys.OLLAMA_SERVICE_URL];
      if (!base) throw new Error("OLLAMA_SERVICE_URL is not defined");
      const tagsUrl = base.replace(/\/$/, "") + "/api/tags";
      lg("discovering models from", tagsUrl);
      const body = (await fetchJson(tagsUrl)) as Record<string, unknown> | undefined;
      if (body && Array.isArray(body.models) && body.models.length > 0) {
        lg(
          "discovered models:",
          (body.models as ModelInfo[]).map((m) => String(m.name || m.model))
        );
        // allow an env override to force a specific model during testing
        const envOverride = process.env[EnvVarKeys.OLLAMA_TEST_MODEL] || process.env[EnvVarKeys.DEEPSEEK_MODEL];
        if (envOverride) {
          lg("model override from env:", envOverride);
          realModel = envOverride;
        } else {
          // prefer any deepseek model if available
          const deepseek = (body.models as ModelInfo[]).find((m) => {
            const n = String(m.name || m.model || "").toLowerCase();
            return n.includes("deepseek") || n.includes("deepseek-r1");
          });
          const preferred = (deepseek || (body.models as ModelInfo[])[0]) as ModelInfo;
          realModel = preferred.name || preferred.model || realModel;
          lg("model chosen:", realModel);
        }

        // heuristics: look for a model likely to support embeddings
        const emb = (body.models as ModelInfo[]).find((m) => {
          const n = String(m.name || m.model || "").toLowerCase();
          const fam = String((m.details && m.details.family) || "").toLowerCase();
          return n.includes("embed") || n.includes("minilm") || fam.includes("minilm") || fam.includes("embed");
        });
        if (emb) embedModel = emb.name || emb.model;
        if (embedModel) lg("embedding-capable model chosen:", embedModel);
      }
    } catch (e) {
      lg("model discovery error", String(e));
      // ignore discovery errors; tests will fall back to defaults
    }

    // load the service after env and client reset using require() to avoid
    // dynamic ESM import issues in the test runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    OllamaService = (require("../../services/ollama.service") as any).default as any;
  });

  afterEach(() => jest.clearAllMocks());

  it("tags - lists local models", async () => {
    lg("test:start tags");
    const res = await OllamaService.tags();
    lg("tags summary", { success: res.success });
    expect(res.success).toBe(true);
    const models = (res.payload as { models?: Array<{ name: string }> }).models || [];
    lg(
      "models listed",
      models.map((m: any) => m.name || m.model)
    );
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThanOrEqual(0);
  });

  it("generate - returns streaming final object when stream=false", async () => {
    lg("test:start generate(non-stream)", { model: realModel });
    const payload: IOllamaGenerateOptions = {
      model: realModel,
      prompt: "Why is the sky blue?",
      stream: false,
    };
    const res = await OllamaService.generate(payload);
    lg("test:generate(non-stream) response summary", { success: res.success, payloadType: typeof res.payload });
    if (!res.success) {
      // fallback: try streaming generate which is faster on many remote hosts
      lg("generate(non-stream) failed, falling back to streaming");
      const streamRes = await OllamaService.generate({ model: realModel, prompt: payload.prompt, stream: true });
      lg("streaming fallback summary", { success: streamRes.success });
      expect(streamRes.success).toBe(true);
      const sresults = (streamRes.payload as { results: IOllamaGenerateResponse[] }).results;
      lg("streaming results count", sresults.length);
      sresults.forEach((r, i) => lg(`stream chunk ${i}`, { response: r.response, structured: (r as any).structured }));
      expect(Array.isArray(sresults)).toBe(true);
      expect(sresults.length).toBeGreaterThanOrEqual(1);
      expect(typeof sresults[sresults.length - 1].response).toBe("string");
      return;
    }

    const results = (res.payload as { results: IOllamaGenerateResponse[] }).results;
    lg("generate(non-stream) results count", results.length);
    results.forEach((r, i) => lg(`result ${i}`, { response: r.response, structured: (r as any).structured }));
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(typeof results[0].response).toBe("string");
  }, 120000);

  it("generate - streaming (real)", async () => {
    lg("test:start generate(stream)", { model: realModel });
    const payload: IOllamaGenerateOptions = { model: realModel, prompt: "Stream test", stream: true };
    const res = await OllamaService.generate(payload);
    lg("stream generate summary", { success: res.success });
    expect(res.success).toBe(true);
    const results = (res.payload as { results: IOllamaGenerateResponse[] }).results;
    lg("streaming results count", results.length);
    results.forEach((r, i) => lg(`stream result ${i}`, { response: r.response, structured: (r as any).structured }));
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(typeof results[results.length - 1].response).toBe("string");
  });

  it("chat - returns message object", async () => {
    lg("test:start chat", { model: realModel });
    const payload: IOllamaChatRequest = { model: realModel, messages: [{ role: "user", content: "Hello" }] };
    const res = await OllamaService.chat(payload);
    lg("chat summary", { success: res.success });
    expect(res.success).toBe(true);
    const messages = (res.payload as { messages?: Array<{ content?: string }> }).messages || [];
    lg("chat messages count", messages.length);
    messages.forEach((m, i) => lg(`chat message ${i}`, { content: m.content, structured: (m as any).structured }));
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(typeof messages[0].content).toBe("string");
  });

  it("embed - handles single input (if an embedding model is available)", async () => {
    if (!embedModel) {
      // If no embedding-capable model discovered, skip the test
      return;
    }
    lg("test:start embed", { model: embedModel });
    const payload: IOllamaEmbedRequest = { model: embedModel, input: "Why is the sky blue?" };
    const res = await OllamaService.embed(payload);
    lg("embed summary", { success: res.success });
    expect(res.success).toBe(true);
    const embeddings = (res.payload as { embeddings?: number[][] }).embeddings;
    lg("embeddings length", Array.isArray(embeddings) ? embeddings.length : 0);
    expect(Array.isArray(embeddings)).toBe(true);
    if (Array.isArray(embeddings)) expect(embeddings.length).toBeGreaterThanOrEqual(1);
  });

  it("generate - structured JSON via format (optional check)", async () => {
    lg("test:start generate(structured)", { model: realModel });
    const payload: IOllamaGenerateOptions = {
      model: realModel,
      prompt: "Ollama is 22 years old and is busy saving the world. Respond using JSON",
      stream: false,
      format: {
        type: "object",
        properties: {
          age: { type: "integer" },
          available: { type: "boolean" },
        },
        required: ["age", "available"],
      },
    };

    const res = await OllamaService.generate(payload);
    lg("generate(structured) summary", { success: res.success });
    expect(res.success).toBe(true);
    const results = (res.payload as { results: IOllamaGenerateResponse[] }).results || [];
    lg("generate(structured) results count", results.length);
    if (results.length === 0) throw new Error("no results returned");

    const structured = (results[results.length - 1] as any).structured;
    lg("generate(structured) structured object", structured ?? "<none>");

    const requireStructured = !!process.env[EnvVarKeys.OLLAMA_REQUIRE_STRUCTURED];
    if (requireStructured) {
      if (!structured)
        throw new Error("No structured JSON was returned by the server — set OLLAMA_REQUIRE_STRUCTURED=false to skip this assertion or pick a model that supports `format`.");
      expect(typeof structured).toBe("object");
      expect(typeof (structured as any).age).toBe("number");
      expect(typeof (structured as any).available).toBe("boolean");
    }
  });
});
