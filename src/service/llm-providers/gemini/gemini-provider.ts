/**
 * Gemini Provider Implementation
 *
 * This file implements the provider for Google's Gemini LLM models. It handles:
 *
 * - Text generation requests to Gemini models
 * - Chat session management with hist        // Store the new session with history management
        this.activeSessions.set(sessionId, { 
          chat, 
          lastUpdated: new Date(),
          modelName: this.modelName,
          history: history || []
        });* - Session creation, retrieval, and deletion
 * - Image-based content generation
 * - Automatic session cleanup
 *
 * The provider implements the iLLMProvider interface to ensure compatibility
 * with the core LLM service, while adding Gemini-specific functionality like
 * chat sessions and multimodal capabilities.
 *
 * It maintains active sessions in memory and includes mechanisms to prevent
 * memory leaks through periodic session cleanup.
 */

import llmConfig from "@/config/llm-config.json";
import { GenerationConfig, GenerativeModel, GoogleGenerativeAI, StartChatParams } from "@google/generative-ai";
import * as fs from "fs";
import LoggingTags from "../../../common/enums/logging-tags.enum";
import { BaseChatMessage } from "../../../common/interfaces/chat-message.interface";
import logger from "../../../common/logging";
import { iLLMChatRequest, iLLMProvider, iLLMRequest, iLLMResponse } from "../../llm.service";
import { GeminiChatManager } from "./gemini-chat-manager";

// Type for chat session storage
interface ChatSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chat: any; // Chat session object from Google's library (type not exported)
  lastUpdated: Date;
  modelName: string; // Track which model this session is using
  history?: BaseChatMessage[]; // Store our own normalized history format
}

export enum GEMINI_MODELS {
  GEMINI_1p5_FLASH = "gemini-1.5-flash",
  GEMINI_1p5_FLASH_8B = "gemini-1.5-flash-8b",
  GEMINI_1p5_PRO = "gemini-1.5-pro",
}

export class GeminiProvider implements iLLMProvider {
  public readonly apiKey: string;
  public readonly modelName: string;
  private model: GenerativeModel;
  private genAI: GoogleGenerativeAI;
  private chatManager: GeminiChatManager;
  private activeSessions: Map<string, ChatSession> = new Map();
  private readonly MAX_TOKEN_LIMIT = 30000; // Example token limit - adjust as needed

  constructor(apiKey: string, modelName: string = GEMINI_MODELS.GEMINI_1p5_FLASH, systemInstruction?: string, generationConfig?: GenerationConfig) {
    this.apiKey = apiKey;
    this.modelName = modelName;

    if (!this.apiKey || this.apiKey.trim() === "") {
      throw new Error("Gemini API key is required");
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemInstruction || llmConfig["system-instruction"],
      generationConfig,
    });

    this.chatManager = new GeminiChatManager(apiKey, modelName, this.MAX_TOKEN_LIMIT);

    // Clean up inactive sessions periodically
    setInterval(() => this.cleanupInactiveSessions(), 1000 * 60 * 30); // Every 30 minutes
  }

  async generateText(request: iLLMRequest): Promise<iLLMResponse> {
    try {
      const imagePath = request.options?.imagePath as string | undefined;
      const content = imagePath ? await this.createImageContent(request.prompt, imagePath) : [request.prompt];

      const result = await this.model.generateContent(content);
      const responseText = result.response.text();

      logger.info(`Generated text response: ${responseText.substring(0, 100)}...`, "GeminiProvider.generateText", LoggingTags.EXTERNAL_API);

      return {
        text: responseText,
        finishReason: "stop",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Gemini generation error: ${errorMessage}`, "GeminiProvider.generateText", LoggingTags.ERROR);
      throw new Error(`Gemini generation failed: ${errorMessage}`);
    }
  }
  private async createImageContent(
    prompt: string,
    imagePath: string
  ): Promise<
    (
      | string
      | {
          inlineData: {
            data: string;
            mimeType: string;
          };
        }
    )[]
  > {
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Invalid prompt");
    }

    const resolvedImagePath = imagePath || process.env.DEFAULT_IMAGE_PATH || "default.png";
    if (!fs.existsSync(resolvedImagePath)) {
      throw new Error(`Image file not found at path: ${resolvedImagePath}`);
    }

    const mimeType = this.getMimeType(resolvedImagePath);
    const imageData = {
      inlineData: {
        data: Buffer.from(fs.readFileSync(resolvedImagePath)).toString("base64"),
        mimeType,
      },
    };

    return [prompt, imageData];
  }

  private getMimeType(filePath: string): string {
    const extension = filePath.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      default:
        return "image/png";
    }
  }

  async chat(request: iLLMChatRequest): Promise<iLLMResponse> {
    try {
      const { sessionId, message, history: incomingHistory, temperature, maxTokens, topP, model } = request;

      // Retrieve the full conversation history (user and model messages)
      let fullHistory: BaseChatMessage[] = [];
      const session = this.activeSessions.get(sessionId);
      let sessionModel = model;
      if (session && session.history && session.history.length > 0) {
        logger.info(`Found existing session ${sessionId} with history length ${session.history.length}`, "GeminiProvider.chat");
        fullHistory = [...session.history];
        // Use the model from the session if not specified in the request
        if (!sessionModel) sessionModel = session.modelName;
      } else if (incomingHistory && incomingHistory.length > 0) {
        fullHistory = [...incomingHistory];
      }

      // Add the new user message to the history
      fullHistory.push({ role: "user", content: message });

      // Convert the full history to Gemini format
      const simplifiedHistory = this.chatManager.simplifyHistoryForGemini(fullHistory);
      logger.info(`GeminiProvider: simplifiedHistory for session ${sessionId}: ${JSON.stringify(simplifiedHistory, null, 2)}`, "GeminiProvider.chat", LoggingTags.LOG);

      // Create generation config from request parameters
      const generationConfig: GenerationConfig = {
        temperature: temperature || 0.7,
        topP: topP || 0.95,
        topK: 40,
        maxOutputTokens: maxTokens || 800,
      };

      // Always create a new ChatSession with the full history
      const chatParams: StartChatParams = {
        history: simplifiedHistory,
        generationConfig: {
          ...this.model.generationConfig,
          ...generationConfig,
        },
        systemInstruction: this.model.systemInstruction,
        safetySettings: this.model.safetySettings,
        tools: this.model.tools,
        toolConfig: this.model.toolConfig,
      };
      // Use the sticky model for the session
      const modelNameToUse = sessionModel || this.modelName;
      const modelInstance = this.genAI.getGenerativeModel({ model: modelNameToUse });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chat = modelInstance.startChat(chatParams) as any;

      // Send the message to Gemini and get response
      const result = await chat.sendMessage(message);
      const responseText = result.response.text();

      // Append the model's response to the history
      fullHistory.push({ role: "model", content: responseText });

      // Persist the updated full history in memory for this session
      this.activeSessions.set(sessionId, {
        chat, // ephemeral
        lastUpdated: new Date(),
        modelName: modelNameToUse,
        history: fullHistory,
      });

      logger.info(`Chat response for session ${sessionId}: ${responseText.substring(0, 100)}...`, "GeminiProvider.chat", LoggingTags.EXTERNAL_API);

      return {
        text: responseText,
        tokenCount: result.response.usageMetadata?.totalTokenCount,
        finishReason: result.response.promptFeedback?.blockReason || "stop",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Gemini chat error: ${errorMessage}`, "GeminiProvider.chat", LoggingTags.ERROR);
      throw new Error(`Gemini chat failed: ${errorMessage}`);
    }
  }

  /**
   * Simply updates the timestamp of a session to prevent premature cleanup
   */
  private updateSessionTimestamp(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.set(sessionId, {
        ...session,
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Cleanup method for inactive sessions to prevent memory leaks
   * @param maxAgeMinutes Maximum age in minutes before a session is considered inactive
   */
  private cleanupInactiveSessions(maxAgeMinutes = 60): void {
    const now = new Date();
    let count = 0;

    this.activeSessions.forEach((session, sessionId) => {
      const ageInMinutes = (now.getTime() - session.lastUpdated.getTime()) / (1000 * 60);
      if (ageInMinutes > maxAgeMinutes) {
        this.activeSessions.delete(sessionId);
        count++;
      }
    });

    if (count > 0) {
      logger.info(`Cleaned up ${count} inactive chat sessions`, "GeminiProvider.cleanupInactiveSessions", LoggingTags.SYSTEM);
    }
  }

  /**
   * Continue a chat session by sending a new message, automatically managing history.
   * @param sessionId The chat session ID
   * @param message The new user message
   * @param options Optional overrides (model, temperature, etc)
   */
  async continueChat(
    sessionId: string,
    message: string,
    options?: { model?: string; maxTokens?: number; temperature?: number; topP?: number; [key: string]: unknown }
  ): Promise<iLLMResponse> {
    const session = this.activeSessions.get(sessionId);
    const history = session?.history ? [...session.history] : [];
    // Add the new user message
    history.push({ role: "user", content: message });
    // Prepare chat request
    const chatRequest: iLLMChatRequest = {
      sessionId,
      message,
      history,
      ...options,
      model: options?.model || session?.modelName || this.modelName,
    };
    // Call the main chat method (which will update history)
    const response = await this.chat(chatRequest);
    return response;
  }
}
