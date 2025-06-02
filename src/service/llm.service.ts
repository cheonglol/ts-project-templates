/**
 * LLM Service
 *
 * This file implements the core LLM (Large Language Model) service that acts as a
 * centralized interface for all LLM operations in the application. It manages:
 *
 * - Provider initialization and selection
 * - Request queueing and processing
 * - Text generation and chat functionality
 * - Model configuration and management
 *
 * The service uses a singleton pattern to provide global access while ensuring
 * only one instance exists. It supports multiple LLM providers and models,
 * with the ability to configure each provider separately.
 *
 * The service also implements a request queue to manage concurrent requests
 * and prevent overwhelming the underlying LLM APIs.
 */

import logger from "../common/logging";
import LoggingTags from "../common/enums/logging-tags.enum";
import { LLMProviderType } from "../common/enums/llm-provider-types.enum";
import { GeminiProvider, GEMINI_MODELS } from "./llm-providers/gemini/gemini-provider";
import dotenv from "dotenv";
import { BaseChatMessage, GeminiChatMessage } from "../common/interfaces/chat-message.interface";

// Provider configuration - makes it accessible outside
export const llmProviderConfig = {
  gemini: {
    apiKey: process.env.LLM_PROVIDER_GEMINI_API_KEY || "",
    defaultModel: GEMINI_MODELS.GEMINI_1p5_FLASH_8B,
    maxConcurrentRequests: parseInt(process.env.LLM_MAX_CONCURRENT_REQUESTS || "1"),
  },
};

// Core interfaces
export interface iLLMRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  model?: string;
  options?: Record<string, unknown>;
}

export interface iLLMChatRequest {
  sessionId: string;
  message: string;
  history?: BaseChatMessage[] | GeminiChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  model?: string;
  options?: Record<string, unknown>;
}

export interface iLLMResponse {
  text: string;
  tokenCount?: number;
  finishReason?: string;
}

export interface iLLMProvider {
  generateText(request: iLLMRequest): Promise<iLLMResponse>;
  chat?(request: iLLMChatRequest): Promise<iLLMResponse>;
  // No continueChat: chat() handles both new and ongoing sessions based on sessionId
}

// Queue request interface
interface QueuedRequest {
  request: {
    type: "text" | "chat";
    textRequest?: iLLMRequest;
    chatRequest?: iLLMChatRequest;
  };
  resolve: (value: iLLMResponse | PromiseLike<iLLMResponse>) => void;
  reject: (reason?: unknown) => void;
}

// Main LLM Service - The single interface for all LLM operations
export class LLMService {
  private providers: Map<string, iLLMProvider> = new Map();
  private defaultProvider!: iLLMProvider; // Use definite assignment assertion
  private static instance: LLMService | null = null;

  // Queue-related properties
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private maxConcurrentRequests = 1; // Can be configurable
  private activeRequests = 0;

  constructor(providerType?: LLMProviderType) {
    dotenv.config();
    if (providerType) {
      this.initializeProvider(providerType);
    }
  }

  // Singleton pattern for global access
  static getInstance(providerType?: LLMProviderType): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService(providerType);
    } else if (providerType && LLMService.instance) {
      // Initialize provider if it wasn't initialized before
      if (LLMService.instance.providers.size === 0) {
        LLMService.instance.initializeProvider(providerType);
      }
    }
    return LLMService.instance;
  }

  static resetInstance(): void {
    LLMService.instance = null;
  }
  private initializeProvider(providerType: LLMProviderType): void {
    if (!providerType) {
      throw new Error("LLM provider type must be explicitly specified");
    }

    switch (providerType) {
      case LLMProviderType.GEMINI: {
        const geminiApiKey = process.env.LLM_PROVIDER_GEMINI_API_KEY;
        if (!geminiApiKey || geminiApiKey.trim() === "") {
          throw new Error("LLM_PROVIDER_GEMINI_API_KEY is not set or is empty");
        }

        // Initialize default Gemini provider
        const defaultGemini = new GeminiProvider(geminiApiKey, GEMINI_MODELS.GEMINI_1p5_FLASH_8B);
        this.defaultProvider = defaultGemini;
        this.providers.set("default", defaultGemini);
        this.providers.set(GEMINI_MODELS.GEMINI_1p5_FLASH_8B, defaultGemini);

        // Add other Gemini model variants
        const flashProvider = new GeminiProvider(geminiApiKey, GEMINI_MODELS.GEMINI_1p5_FLASH);
        this.providers.set(GEMINI_MODELS.GEMINI_1p5_FLASH, flashProvider);

        logger.info(`Initialized LLM service with ${providerType} provider`, "LLMService.initializeProvider", LoggingTags.STARTUP);
        break;
      }
      default: {
        throw new Error(`Unsupported LLM provider type: ${providerType}`);
      }
    }
  }

  // Add custom model configuration
  addModel(modelName: string, provider: iLLMProvider): void {
    this.providers.set(modelName, provider);
    logger.info(`Added custom model: ${modelName}`, "LLMService.addModel", LoggingTags.SYSTEM);
  }

  // Add Gemini model variant with custom config
  addGeminiModel(modelName: string, systemInstruction?: string, generationConfig?: Record<string, unknown>): void {
    const geminiApiKey = process.env.LLM_PROVIDER_GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error("Gemini API key not available");
    }

    const provider = new GeminiProvider(geminiApiKey, modelName, systemInstruction, generationConfig);
    this.providers.set(modelName, provider);
    logger.info(`Added Gemini model variant: ${modelName}`, `${LLMService.name}.${this.addGeminiModel.name}`, LoggingTags.SYSTEM);
  }

  // Main text generation method
  async generateText(request: iLLMRequest): Promise<iLLMResponse> {
    logger.info(`Enqueueing prompt with ${request.model || "default"} model: ${request.prompt.substring(0, 25)}...`, "LLMService.generateText", LoggingTags.EXTERNAL_API);
    return this.enqueueRequest({
      type: "text",
      textRequest: request,
    });
  }

  // Chat method for conversation history
  async chat(request: iLLMChatRequest): Promise<iLLMResponse> {
    logger.info(`Enqueueing chat with ${request.model || "default"} model for session: ${request.sessionId}`, "LLMService.chat", LoggingTags.EXTERNAL_API);
    return this.enqueueRequest({
      type: "chat",
      chatRequest: request,
    });
  }

  private enqueueRequest(request: { type: "text" | "chat"; textRequest?: iLLMRequest; chatRequest?: iLLMChatRequest }): Promise<iLLMResponse> {
    return new Promise<iLLMResponse>((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject });
      logger.info(`Request added to queue. Queue length: ${this.requestQueue.length}`, "LLMService.enqueueRequest", LoggingTags.SYSTEM);
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
        const { request, resolve, reject } = this.requestQueue.shift()!;
        this.activeRequests++;

        logger.info(`Processing request from queue. Remaining: ${this.requestQueue.length}`, "LLMService.processQueue", LoggingTags.SYSTEM);
        try {
          if (request.type === "chat" && request.chatRequest) {
            const provider = this.getProvider(request.chatRequest.model);
            if (!provider.chat) {
              throw new Error(`Provider does not support chat functionality`);
            }
            const response = await provider.chat(request.chatRequest);
            resolve(response);
            return;
          }

          if (request.type === "text" && request.textRequest) {
            const provider = this.getProvider(request.textRequest.model);
            const response = await provider.generateText(request.textRequest);
            resolve(response);
            return;
          }

          throw new Error("Invalid request type or missing request data");
        } catch (error) {
          logger.error(`LLM generation failed: ${error instanceof Error ? error.message : "Unknown error"}`, "LLMService.processQueue", LoggingTags.ERROR);
          reject(error);
        } finally {
          this.activeRequests--;
        }
      }
    } finally {
      this.isProcessingQueue = false;
      if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
        this.processQueue();
      }
    }
  }

  setMaxConcurrentRequests(max: number): void {
    if (max < 1) throw new Error("Max concurrent requests must be at least 1");
    this.maxConcurrentRequests = max;
    logger.info(`Max concurrent requests set to: ${max}`, "LLMService.setMaxConcurrentRequests", LoggingTags.SYSTEM);
  }

  getQueueStatus(): { queueLength: number; activeRequests: number; maxConcurrentRequests: number } {
    return {
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
    };
  }

  // Get available models
  getAvailableModels(): string[] {
    return Array.from(this.providers.keys());
  }

  // Set default model
  setDefaultModel(modelName: string): void {
    const provider = this.providers.get(modelName);
    if (!provider) {
      throw new Error(`Model ${modelName} not found`);
    }
    this.defaultProvider = provider;
    logger.info(`Default model set to: ${modelName}`, `${LLMService.name}.${this.setDefaultModel.name}`, LoggingTags.SYSTEM);
  }

  private getProvider(modelName?: string): iLLMProvider {
    if (!modelName) {
      return this.defaultProvider;
    }

    const provider = this.providers.get(modelName);
    if (!provider) {
      logger.warn(`Model ${modelName} not found, using default provider`, `${LLMService.name}.${this.getProvider.name}`, LoggingTags.WARNING);
      return this.defaultProvider;
    }

    return provider;
  }

  // Get service status
  getStatus() {
    return {
      availableModels: this.getAvailableModels(),
      defaultModel: this.providers.get("default") ? "default" : "unknown",
      providerCount: this.providers.size,
      queue: this.getQueueStatus(),
    };
  }
}

// Convenience factory function
export const createLLMService = (providerType: LLMProviderType = LLMProviderType.GEMINI): LLMService => {
  return new LLMService(providerType);
};

// Export the LLMService class - initialization must be done explicitly in index.ts
export default LLMService;
