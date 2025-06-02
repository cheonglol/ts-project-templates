/**
 * Chat Message Interfaces
 *
 * This file defines the core message structures used throughout the LLM chat functionality.
 * It provides a flexible type hierarchy for working with different message formats:
 *
 * - BaseChatMessage: Common interface for all message types
 * - ChatMessage: Simple format with string content for internal use
 * - GeminiChatMessage: Advanced format compatible with Google's Gemini API
 *
 * The file also includes utility functions to convert between different message formats,
 * allowing seamless integration between different components of the application that
 * might expect different message structures.
 *
 * This architecture ensures type safety while providing flexibility to work with
 * different LLM providers that may have different message format requirements.
 */

/**
 * Base message interface for all chat providers
 */
export interface BaseChatMessage {
  role: "user" | "model" | "system" | string;
  content?: string;
  timestamp?: Date;
}

/**
 * Simple chat message with string content
 * Used for general-purpose message representation
 */
export interface ChatMessage extends BaseChatMessage {
  role: "user" | "model" | "system";
  content: string;
}

/**
 * Part structure for Gemini messages
 * Can be simple text or structured content
 */
export interface ChatMessagePart {
  text?: string;
  // Index signature with more specific types than 'any'
  [key: string]: string | number | boolean | object | undefined;
}

/**
 * Gemini-specific chat message that follows Google's API structure
 * with advanced parts support
 */
export interface GeminiChatMessage extends BaseChatMessage {
  role: "user" | "model" | "system" | string;
  parts: Array<ChatMessagePart>;
  content?: never; // Ensures content is not used alongside parts
}

/**
 * Utility type to work with either message format
 */
export type AnyMessageFormat = ChatMessage | GeminiChatMessage;

/**
 * Convert a simple ChatMessage to a GeminiChatMessage
 */
export function convertToGeminiFormat(message: ChatMessage): GeminiChatMessage {
  return {
    role: message.role,
    parts: [{ text: message.content }],
    timestamp: message.timestamp,
  };
}

/**
 * Convert a GeminiChatMessage to a simple ChatMessage format
 * Note: This will combine all text parts into a single string
 */
export function convertToSimpleFormat(message: GeminiChatMessage): ChatMessage {
  // Ensure the role is one of the allowed values for ChatMessage
  const validRole: "user" | "model" | "system" = message.role === "user" || message.role === "model" || message.role === "system" ? message.role : "system";

  return {
    role: validRole,
    content: message.parts
      .map((part) => ("text" in part ? part.text : JSON.stringify(part)))
      .filter(Boolean)
      .join(" "),
    timestamp: message.timestamp,
  };
}

/**
 * Convert an array of messages from one format to another
 */
export function convertMessages(messages: ChatMessage[]): GeminiChatMessage[];
export function convertMessages(messages: GeminiChatMessage[]): ChatMessage[];
export function convertMessages(messages: AnyMessageFormat[]): AnyMessageFormat[] {
  if (messages.length === 0) return [];

  // Check if we're dealing with GeminiChatMessages by looking for 'parts'
  if ("parts" in messages[0]) {
    // Convert from Gemini to simple format
    return (messages as GeminiChatMessage[]).map(convertToSimpleFormat);
  } else {
    // Convert from simple to Gemini format
    return (messages as ChatMessage[]).map(convertToGeminiFormat);
  }
}
