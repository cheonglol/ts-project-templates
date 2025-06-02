// filepath: src/repository/chat-history.repository.ts
// Generic chat history repository for LLMService, provider-agnostic

import { BaseChatMessage } from "../common/interfaces/chat-message.interface";

export interface iChatHistoryRecord {
  sessionId: string;
  provider: string;
  model: string;
  history: BaseChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface iChatHistoryRepository {
  saveHistory(record: iChatHistoryRecord): Promise<void>;
  getHistory(sessionId: string): Promise<iChatHistoryRecord | null>;
  updateHistory(sessionId: string, history: BaseChatMessage[]): Promise<void>;
  deleteHistory(sessionId: string): Promise<void>;
  listSessions(): Promise<iChatHistoryRecord[]>;
}

// In-memory implementation for now; swap with DB later
export class InMemoryChatHistoryRepository implements iChatHistoryRepository {
  private store = new Map<string, iChatHistoryRecord>();

  async saveHistory(record: iChatHistoryRecord): Promise<void> {
    this.store.set(record.sessionId, record);
  }

  async getHistory(sessionId: string): Promise<iChatHistoryRecord | null> {
    return this.store.get(sessionId) || null;
  }

  async updateHistory(sessionId: string, history: BaseChatMessage[]): Promise<void> {
    const record = this.store.get(sessionId);
    if (record) {
      record.history = history;
      record.updatedAt = new Date();
      this.store.set(sessionId, record);
    }
  }

  async deleteHistory(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async listSessions(): Promise<iChatHistoryRecord[]> {
    return Array.from(this.store.values());
  }
}
