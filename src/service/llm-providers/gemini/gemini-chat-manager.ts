/**
 * Gemini Chat Manager
 *
 * This file provides the specialized chat management functionality for Google's Gemini AI models.
 * It handles:
 *
 * - Chat session creation and tracking
 * - Message history management and trimming
 * - Token counting and limit enforcement
 * - Format conversion between internal message formats and Gemini API formats
 * - Explicit caching support (future implementation)
 *
 * The GeminiChatManager class maintains a clean separation of concerns by focusing on
 * chat-specific functionality, allowing the main provider class to handle the higher-level
 * API interactions.
 *
 * This manager is designed to be instantiated by the GeminiProvider and work as its
 * dedicated chat handler for improved code organization and maintainability.
 */

import { GenerationConfig, GoogleGenerativeAI } from "@google/generative-ai";
import { BaseChatMessage, ChatMessage, GeminiChatMessage } from "../../../common/interfaces/chat-message.interface";

// Define a type for chat sessions
export interface GeminiChatSession {
  sendMessage(text: string | object): Promise<{
    response: {
      text: () => string;
      usageMetadata?: { totalTokenCount?: number };
      promptFeedback?: { blockReason?: string };
    };
  }>;
}

/**
 * GeminiChatManager class for managing chat history and token limits.
 *
 * Explicit caching is not yet implemented. See TODO above.
 */
export class GeminiChatManager {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private tokenLimit: number;
  private activeChatSessions: Map<string, GeminiChatSession> = new Map(); // Store active chat sessions

  constructor(apiKey: string, modelName: string, tokenLimit: number) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.tokenLimit = tokenLimit;
  }

  /**
   * Simplifies history format for Gemini API compatibility
   * @param history Original chat messages
   * @returns Simplified format compatible with Gemini API
   */ simplifyHistoryForGemini(history: BaseChatMessage[]): { role: string; parts: { text: string }[] }[] {
    return history.map((msg) => {
      // Handle GeminiChatMessage (with parts property)
      if ("parts" in msg) {
        const geminiMsg = msg as GeminiChatMessage;
        return {
          role: geminiMsg.role,
          parts: [
            {
              text: geminiMsg.parts.map((part) => ("text" in part ? part.text || "" : JSON.stringify(part))).join(" "),
            },
          ],
        };
      }
      // Handle ChatMessage (with content property)
      else if ("content" in msg) {
        const simpleMsg = msg as ChatMessage;
        return {
          role: simpleMsg.role,
          parts: [{ text: simpleMsg.content }],
        };
      }
      // Fallback for BaseChatMessage without content
      else {
        return {
          role: msg.role,
          parts: [{ text: "No content" }],
        };
      }
    });
  }
  /**
   * Creates a new chat session with history
   * @param sessionId Unique session identifier
   * @param history Initial chat history
   * @returns Chat session object
   */
  createChatSession(sessionId: string, history?: BaseChatMessage[], generationConfig?: GenerationConfig): GeminiChatSession {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    // Convert history if provided
    const simplifiedHistory = history ? this.simplifyHistoryForGemini(history) : undefined;

    // Create chat instance
    const chat = model.startChat({
      history: simplifiedHistory,
      generationConfig: generationConfig || {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 800,
      },
    });

    // Store chat session
    this.activeChatSessions.set(sessionId, chat);
    return chat;
  }

  /**
   * Get existing chat session
   */
  getChatSession(sessionId: string): GeminiChatSession | undefined {
    return this.activeChatSessions.get(sessionId);
  }

  /**
   * Trims chat history to fit within the token limit, including the new message.
   * @param history Array of chat messages (role/parts)
   * @param newMessage The new user message to append
   * @returns Trimmed history including the new message
   */
  async trimHistory(history: GeminiChatMessage[], newMessage: GeminiChatMessage): Promise<GeminiChatMessage[]> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    const trimmedHistory = [...history];

    // Create simplified content for token counting
    const simplifiedContent = this.simplifyHistoryForGemini([...trimmedHistory, newMessage]);
    let count = await model.countTokens({ contents: simplifiedContent });

    while (count.totalTokens > this.tokenLimit && trimmedHistory.length > 0) {
      trimmedHistory.shift();
      const newSimplifiedContent = this.simplifyHistoryForGemini([...trimmedHistory, newMessage]);
      count = await model.countTokens({ contents: newSimplifiedContent });
    }
    return [...trimmedHistory, newMessage];
  }

  /**
   * EXPLICIT CACHING (Gemini API):
   * Create a cache for large context/system instructions and return the cache key.
   */
  async createExplicitCache(systemInstruction: string, contents: GeminiChatMessage[]): Promise<string> {
    // Convert chat messages to simplified Gemini content format
    const simplifiedContent = this.simplifyHistoryForGemini(contents);
    // @ts-expect-error: caches may not be in types yet
    const cache = await this.genAI.caches.create({
      model: this.modelName,
      config: {
        contents: simplifiedContent,
        systemInstruction,
      },
    });
    return cache.name;
  }

  /**
   * Generate content using a cache key (explicit caching).
   */
  async generateWithCache(cacheKey: string, userMessage: GeminiChatMessage): Promise<unknown> {
    // Create simplified content
    const simplifiedContent = this.simplifyHistoryForGemini([userMessage]);
    const response = await this.genAI.getGenerativeModel({ model: this.modelName }).generateContent({
      contents: simplifiedContent,
      cachedContent: cacheKey,
    });
    return response;
  }

  /**
   * Converts Gemini/Google's native chat history format to our internal BaseChatMessage format
   * @param googleHistory History from Google's API or chat session
   * @returns Array of BaseChatMessage objects
   */
  convertFromGeminiHistory(googleHistory: Array<{ role: string; parts: { text?: string }[] }>): BaseChatMessage[] {
    if (!googleHistory || !Array.isArray(googleHistory)) {
      return [];
    }

    return googleHistory.map((msg) => {
      // Determine if this should be a GeminiChatMessage or ChatMessage
      // Keep as GeminiChatMessage if it has complex parts
      const hasComplexParts = msg.parts && msg.parts.some((part) => typeof part !== "object" || (part && Object.keys(part).some((key) => key !== "text")));

      if (hasComplexParts) {
        // Convert to GeminiChatMessage format
        return {
          role: msg.role,
          parts: msg.parts.map((part) => {
            // If it's already in the right format, keep it
            if (typeof part === "object") return part;
            // Otherwise wrap it
            return { text: String(part) };
          }),
          timestamp: new Date(),
        } as GeminiChatMessage;
      } else {
        // Convert to simpler ChatMessage format
        const validRole: "user" | "model" | "system" = msg.role === "user" || msg.role === "model" || msg.role === "system" ? msg.role : "system";

        return {
          role: validRole,
          content: msg.parts
            .map((part) => (part && part.text) || JSON.stringify(part))
            .filter(Boolean)
            .join(" "),
          timestamp: new Date(),
        } as ChatMessage;
      }
    });
  }
}

// TODO: In the future, consider extracting the trimHistory logic into a shared utility or abstract interface for all LLM providers.
// This would allow either a common implementation for context trimming, or require each provider to implement its own version in a dedicated class, depending on which approach is more maintainable and flexible for your architecture.

// File renamed: gemini-history-utils.ts → gemini-chat-manager.ts
// All logic is now in the GeminiChatManager class. No utils remain.

// TODO: Implement Gemini explicit caching support.
// This includes creating, storing, and referencing cache keys for large context/system instructions
// to optimize cost and performance as per Gemini API's explicit caching feature.
// See: https://ai.google.dev/gemini-api/docs/caching?lang=node#explicit-caching
