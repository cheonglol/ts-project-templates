// Mock the config file before other imports
jest.mock(
  "@/config/llm-config.json",
  () => ({
    "system-instruction": "Test system instruction",
  }),
  { virtual: true }
);

import { LLMProviderType } from "../common/enums/llm-provider-types.enum";
import { BaseChatMessage, ChatMessage } from "../common/interfaces/chat-message.interface";
import { GEMINI_MODELS, GeminiProvider } from "../service/llm-providers/gemini/gemini-provider";
import LLMService, { createLLMService, iLLMChatRequest, iLLMRequest } from "../service/llm.service";

// Mock dependencies
jest.mock("../service/llm-providers/gemini/gemini-provider");
jest.mock("../common/logging");

const MockGeminiProvider = GeminiProvider as jest.MockedClass<typeof GeminiProvider>;

describe("LLMService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LLMService.resetInstance();

    // Mock environment variable
    process.env.LLM_PROVIDER_GEMINI_API_KEY = "test-api-key";
    MockGeminiProvider.mockImplementation(
      (apiKey: string, modelName?: string) =>
        ({
          apiKey,
          modelName: modelName || GEMINI_MODELS.GEMINI_1p5_FLASH_8B,
          generateText: jest.fn().mockResolvedValue({
            text: "Generated response",
            finishReason: "stop",
          }),
          chat: jest.fn().mockResolvedValue({
            text: "Chat response",
            tokenCount: 50,
            finishReason: "stop",
          }),
          createChatSession: jest.fn(),
          deleteChatSession: jest.fn().mockReturnValue(true),
          getSession: jest.fn(),
        }) as unknown as GeminiProvider
    );
  });

  afterEach(() => {
    delete process.env.LLM_PROVIDER_GEMINI_API_KEY;
  });
  describe("constructor", () => {
    it("should create service with explicitly provided Gemini provider", () => {
      const service = new LLMService(LLMProviderType.GEMINI);

      expect(MockGeminiProvider).toHaveBeenCalledWith("test-api-key", GEMINI_MODELS.GEMINI_1p5_FLASH_8B);
      expect(service.getAvailableModels()).toContain("default");
      expect(service.getAvailableModels()).toContain(GEMINI_MODELS.GEMINI_1p5_FLASH_8B);
    });

    it("should initialize multiple Gemini models", () => {
      const service = new LLMService(LLMProviderType.GEMINI);

      expect(MockGeminiProvider).toHaveBeenCalledTimes(2); // default + flash variant
      expect(service.getAvailableModels()).toContain(GEMINI_MODELS.GEMINI_1p5_FLASH_8B);
      expect(service.getAvailableModels()).toContain(GEMINI_MODELS.GEMINI_1p5_FLASH);
    });

    it("should throw error when API key is missing", () => {
      // Save the original API key
      const originalApiKey = process.env.LLM_PROVIDER_GEMINI_API_KEY;

      // Delete the API key for this test
      delete process.env.LLM_PROVIDER_GEMINI_API_KEY;

      // Clear mocks to ensure fresh mock implementation
      jest.clearAllMocks();

      // Mock the provider to throw when no API key
      MockGeminiProvider.mockImplementation(() => {
        throw new Error("LLM_PROVIDER_GEMINI_API_KEY is not set or is empty");
      });

      try {
        // Now this should throw the expected error
        expect(() => new LLMService(LLMProviderType.GEMINI)).toThrow("LLM_PROVIDER_GEMINI_API_KEY is not set or is empty");
      } finally {
        // Restore the original API key
        process.env.LLM_PROVIDER_GEMINI_API_KEY = originalApiKey;
      }
    });

    it("should throw error for unsupported provider type", () => {
      expect(() => new LLMService("unsupported" as LLMProviderType)).toThrow("Unsupported LLM provider type: unsupported");
    });
  });
  describe("singleton pattern", () => {
    it("should return same instance on multiple calls", () => {
      const service1 = LLMService.getInstance(LLMProviderType.GEMINI);
      const service2 = LLMService.getInstance(LLMProviderType.GEMINI);

      expect(service1).toBe(service2);
    });

    it("should create new instance after reset", () => {
      const service1 = LLMService.getInstance(LLMProviderType.GEMINI);
      LLMService.resetInstance();
      const service2 = LLMService.getInstance(LLMProviderType.GEMINI);

      expect(service1).not.toBe(service2);
    });
  });
  describe("generateText", () => {
    let service: LLMService;

    beforeEach(() => {
      service = new LLMService(LLMProviderType.GEMINI);
    });

    it("should generate text using default provider", async () => {
      const request: iLLMRequest = { prompt: "Test prompt" };
      const result = await service.generateText(request);

      expect(result).toEqual({
        text: "Generated response",
        finishReason: "stop",
      });
    });

    it("should generate text using specific model", async () => {
      const request: iLLMRequest = {
        prompt: "Test prompt",
        model: GEMINI_MODELS.GEMINI_1p5_FLASH,
      };

      const result = await service.generateText(request);

      expect(result).toEqual({
        text: "Generated response",
        finishReason: "stop",
      });
    });

    it("should fall back to default provider for unknown model", async () => {
      const request: iLLMRequest = {
        prompt: "Test prompt",
        model: "unknown-model",
      };

      const result = await service.generateText(request);

      expect(result).toEqual({
        text: "Generated response",
        finishReason: "stop",
      });
    });

    it("should handle provider errors", async () => {
      MockGeminiProvider.mockImplementation(
        () =>
          ({
            generateText: jest.fn().mockRejectedValue(new Error("Provider error")),
          }) as unknown as GeminiProvider
      );
      const service = new LLMService(LLMProviderType.GEMINI);
      const request: iLLMRequest = { prompt: "Test prompt" };

      await expect(service.generateText(request)).rejects.toThrow("Provider error");
    });
  });
  describe("model management", () => {
    let service: LLMService;

    beforeEach(() => {
      service = new LLMService(LLMProviderType.GEMINI);
    });

    it("should add custom Gemini model", () => {
      service.addGeminiModel("custom-model", "Custom instruction", { temperature: 0.8 });

      expect(service.getAvailableModels()).toContain("custom-model");
      expect(MockGeminiProvider).toHaveBeenCalledWith("test-api-key", "custom-model", "Custom instruction", { temperature: 0.8 });
    });

    it("should add custom model with provider", () => {
      const mockProvider = {
        generateText: jest.fn().mockResolvedValue({ text: "Custom response", finishReason: "stop" }),
      };

      service.addModel("custom-provider", mockProvider);

      expect(service.getAvailableModels()).toContain("custom-provider");
    });

    it("should set default model", () => {
      service.setDefaultModel(GEMINI_MODELS.GEMINI_1p5_FLASH);

      // No error should be thrown
      expect(() => service.setDefaultModel(GEMINI_MODELS.GEMINI_1p5_FLASH)).not.toThrow();
    });

    it("should throw error when setting non-existent default model", () => {
      expect(() => service.setDefaultModel("non-existent-model")).toThrow("Model non-existent-model not found");
    });
  });

  describe("service status", () => {
    it("should return correct status", () => {
      const service = new LLMService(LLMProviderType.GEMINI);
      const status = service.getStatus();

      expect(status).toEqual({
        availableModels: expect.arrayContaining(["default", GEMINI_MODELS.GEMINI_1p5_FLASH_8B, GEMINI_MODELS.GEMINI_1p5_FLASH]),
        defaultModel: "default",
        providerCount: 3,
        queue: {
          activeRequests: 0,
          maxConcurrentRequests: 1,
          queueLength: 0,
        },
      });
    });
  });
  describe("factory functions", () => {
    it("should create service with createLLMService", () => {
      const service = createLLMService(LLMProviderType.GEMINI);
      expect(service).toBeInstanceOf(LLMService);
    });
  });

  describe("chat", () => {
    let service: LLMService;

    beforeEach(() => {
      service = new LLMService(LLMProviderType.GEMINI);
    });

    it("should process chat requests with default provider", async () => {
      const request: iLLMChatRequest = {
        sessionId: "test-session",
        message: "Hello, world!",
      };

      const result = await service.chat(request);

      expect(result).toEqual({
        text: "Chat response",
        tokenCount: 50,
        finishReason: "stop",
      });
    });

    it("should process chat requests with message history", async () => {
      const history: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "model", content: "Hi there!" },
      ];

      const request: iLLMChatRequest = {
        sessionId: "test-session",
        message: "How are you?",
        history,
      };

      const result = await service.chat(request);

      expect(result).toEqual({
        text: "Chat response",
        tokenCount: 50,
        finishReason: "stop",
      });
    });

    it("should use specified model for chat", async () => {
      const request: iLLMChatRequest = {
        sessionId: "test-session",
        message: "Hello, world!",
        model: GEMINI_MODELS.GEMINI_1p5_FLASH,
      };

      const result = await service.chat(request);

      expect(result).toEqual({
        text: "Chat response",
        tokenCount: 50,
        finishReason: "stop",
      });
    });

    it("should handle chat provider errors", async () => {
      // Recreate the mock with a failing chat method for this specific test
      MockGeminiProvider.mockImplementation(
        () =>
          ({
            chat: jest.fn().mockRejectedValue(new Error("Chat provider error")),
            generateText: jest.fn().mockResolvedValue({
              text: "Generated response",
              finishReason: "stop",
            }),
          }) as unknown as GeminiProvider
      );

      const service = new LLMService(LLMProviderType.GEMINI);
      const request: iLLMChatRequest = { sessionId: "test-session", message: "Hello" };

      await expect(service.chat(request)).rejects.toThrow("Chat provider error");
    });

    it("should throw error if provider does not support chat", async () => {
      // Create a mock provider without chat support
      const mockProvider = {
        generateText: jest.fn().mockResolvedValue({ text: "Text response", finishReason: "stop" }),
      };

      service.addModel("text-only-model", mockProvider);

      const request: iLLMChatRequest = {
        sessionId: "test-session",
        message: "Hello",
        model: "text-only-model",
      };

      await expect(service.chat(request)).rejects.toThrow("Provider does not support chat functionality");
    });

    it("should maintain and synchronize chat history across multiple requests", async () => {
      // Store messages and responses for verification
      const sessionMessages: { request: string; response: string }[] = [];
      const sessionId = "persistent-history-test-session";
      let capturedHistory: BaseChatMessage[] | undefined;

      // Track calls to the provider's chat method to verify history passing
      let chatCallCount = 0;

      // Create a mock implementation that captures history and tracks interactions
      MockGeminiProvider.mockImplementation(
        () =>
          ({
            chat: jest.fn().mockImplementation((request: iLLMChatRequest) => {
              chatCallCount++;

              // Capture the history for verification
              capturedHistory = request.history;

              // Record this interaction
              const userMessage = request.message;
              const responseText = `Response to "${userMessage}" (call #${chatCallCount})`;
              sessionMessages.push({ request: userMessage, response: responseText });

              return Promise.resolve({
                text: responseText,
                tokenCount: 50,
                finishReason: "stop",
              });
            }),
            // Mock the synchronization methods that should be used internally
            getOrCreateChatSession: jest.fn().mockImplementation((sessionId, history) => {
              return {
                chat: {
                  sendMessage: jest.fn().mockResolvedValue({
                    response: {
                      text: () => "Mocked response",
                      usageMetadata: { totalTokenCount: 50 },
                    },
                  }),
                },
                initialHistory: history || [],
              };
            }),
            syncHistoryWithGoogle: jest.fn(),
            generateText: jest.fn().mockResolvedValue({
              text: "Generated response",
              finishReason: "stop",
            }),
          }) as unknown as GeminiProvider
      );

      // Create a fresh service for this test
      const service = new LLMService(LLMProviderType.GEMINI);

      // First chat request (no history yet)
      await service.chat({
        sessionId,
        message: "First message",
      });

      // Second chat request (should include history from first interaction)
      await service.chat({
        sessionId,
        message: "Second message",
      });

      // Third chat request (should include history from both previous interactions)
      await service.chat({
        sessionId,
        message: "What did I ask you earlier?",
      });

      // Verify chat was called the expected number of times
      expect(chatCallCount).toBe(3);

      // Verify the captured history from the final call
      expect(capturedHistory).toBeDefined();
      expect(capturedHistory?.length).toBeGreaterThanOrEqual(4); // At minimum: 2 messages + 2 responses

      // Verify history contains all messages in order
      if (capturedHistory) {
        // Find user messages in history
        const userMessages = capturedHistory.filter((msg) => msg.role === "user");
        expect(userMessages.length).toBeGreaterThanOrEqual(3);

        // Verify the order of user messages
        if (userMessages.length >= 3 && userMessages[0].content && userMessages[1].content && userMessages[2].content) {
          expect(userMessages[0].content).toContain("First message");
          expect(userMessages[1].content).toContain("Second message");
          expect(userMessages[2].content).toContain("What did I ask you earlier");
        }

        // Find model responses in history
        const modelMessages = capturedHistory.filter((msg) => msg.role === "model");
        expect(modelMessages.length).toBeGreaterThanOrEqual(2); // Should have at least 2 responses
      }

      // Verify each message got a unique, contextually relevant response
      expect(sessionMessages.length).toBe(3);
      expect(sessionMessages[0].response).toContain('Response to "First message"');
      expect(sessionMessages[1].response).toContain('Response to "Second message"');
      expect(sessionMessages[2].response).toContain('Response to "What did I ask you earlier?"');
    });

    it("should aggressively validate chat history integrity with complex conversational patterns", async () => {
      // Create a dedicated mock for this test that simulates real provider behavior
      // with history tracking and synchronization
      const mockChatSessions = new Map();
      const mockHistoryRecords = new Map();
      let chatCalls = 0;

      // Simulate delayed response like a real API
      const simulateDelay = () => new Promise((resolve) => setTimeout(resolve, 5));

      MockGeminiProvider.mockImplementation(
        () =>
          ({
            // Track every chat call with detailed metrics
            chat: jest.fn().mockImplementation(async (request: iLLMChatRequest) => {
              chatCalls++;
              await simulateDelay(); // Simulate network delay

              const { sessionId, message } = request;
              const existingHistory = mockHistoryRecords.get(sessionId) || [];

              // Always track the full conversation history
              const updatedHistory = [...existingHistory];

              // Add user message
              const userMessage: BaseChatMessage = {
                role: "user",
                content: message,
                timestamp: new Date(),
              };
              updatedHistory.push(userMessage);

              // Generate response based on message pattern for testability
              let responseText: string;
              if (message.includes("summary")) {
                // Extract all past user messages
                const pastUserMessages = updatedHistory
                  .filter((msg) => msg.role === "user" && msg.content)
                  .map((msg) => `"${msg.content}"`)
                  .join(", ");
                responseText = `Your past messages were: ${pastUserMessages}`;
              } else if (message.includes("count")) {
                // Count message pairs
                const messageCount = Math.floor(updatedHistory.length / 2);
                responseText = `You have sent ${messageCount} messages so far.`;
              } else {
                // Default echo response
                responseText = `Response to: "${message}" (interaction #${chatCalls})`;
              }

              // Add model response
              const modelResponse: BaseChatMessage = {
                role: "model",
                content: responseText,
                timestamp: new Date(),
              };
              updatedHistory.push(modelResponse);

              // Update stored history
              mockHistoryRecords.set(sessionId, updatedHistory);

              return {
                text: responseText,
                tokenCount: message.length * 2, // Mock token count
                finishReason: "stop",
              };
            }),

            // Mock proper session management
            getOrCreateChatSession: jest.fn().mockImplementation((sessionId, history) => {
              const existingSession = mockChatSessions.get(sessionId);

              if (existingSession) {
                return {
                  chat: existingSession,
                  initialHistory: mockHistoryRecords.get(sessionId) || [],
                };
              }

              // Create new mock Google chat session
              const newSession = {
                sendMessage: async (text: string) => {
                  await simulateDelay();
                  const response = `Mock Google response to: ${text}`;
                  return {
                    response: {
                      text: () => response,
                      usageMetadata: { totalTokenCount: text.length * 2 },
                    },
                  };
                },
              };

              mockChatSessions.set(sessionId, newSession);

              // Initialize history if provided
              if (history) {
                mockHistoryRecords.set(sessionId, [...history]);
              }

              return {
                chat: newSession,
                initialHistory: history || [],
              };
            }),

            // Track history synchronization calls
            syncHistoryWithGoogle: jest.fn().mockImplementation((_chat, _sessionId, _initialHistory, _userMsg, _responseText) => {
              // Just a mock implementation that doesn't need to do anything
            }),

            generateText: jest.fn().mockResolvedValue({
              text: "Generated response",
              finishReason: "stop",
            }),
          }) as unknown as GeminiProvider
      );

      // Create a dedicated service for this test
      const service = new LLMService(LLMProviderType.GEMINI);
      const sessionId = "complex-conversation-session";

      // SEND MULTIPLE MESSAGES IN SEQUENCE

      // First message
      const result1 = await service.chat({
        sessionId,
        message: "Hello, this is my first message.",
      });

      // Second message
      const result2 = await service.chat({
        sessionId,
        message: "This is my second message with follow-up.",
      });

      // Ask for count of messages
      const result3 = await service.chat({
        sessionId,
        message: "Please count my messages so far.",
      });

      // Complex question referring to past context
      const result4 = await service.chat({
        sessionId,
        message: "Can you provide a summary of my questions?",
      });

      // PERFORM AGGRESSIVE TESTING VALIDATIONS

      // 1. Check all messages returned proper responses
      expect(result1.text).toContain("Hello, this is my first message");
      expect(result2.text).toContain("This is my second message");
      expect(result3.text).toContain("You have sent 3 messages");
      expect(result4.text).toContain("Your past messages were");
      expect(result4.text).toContain("Hello, this is my first message");
      expect(result4.text).toContain("Can you provide a summary");

      // 2. Verify provider was called correct number of times
      expect(chatCalls).toBe(4);

      // 3. Check history synchronization happened for all messages
      const providerInstance = MockGeminiProvider.mock.instances[0];
      expect(providerInstance.chat).toHaveBeenCalledTimes(4);

      // 4. Verify final history contains all 8 messages (4 user + 4 model)
      const finalHistory = mockHistoryRecords.get(sessionId);
      expect(finalHistory).toBeDefined();
      expect(finalHistory?.length).toBe(8);

      // 5. Validate strict alternating user/model pattern
      if (finalHistory) {
        for (let i = 0; i < finalHistory.length; i++) {
          if (i % 2 === 0) {
            expect(finalHistory[i].role).toBe("user");
          } else {
            expect(finalHistory[i].role).toBe("model");
          }
        }
      }

      // 6. Test edge case: make concurrent requests to same session
      const concurrentPromises = [
        service.chat({ sessionId, message: "Concurrent message 1" }),
        service.chat({ sessionId, message: "Concurrent message 2" }),
        service.chat({ sessionId, message: "Concurrent message 3" }),
      ];

      const concurrentResults = await Promise.all(concurrentPromises);

      // 7. Verify all concurrent messages were processed
      expect(concurrentResults.length).toBe(3);

      // 8. Check final history contains ALL messages in proper sequence
      const finalHistoryAfterConcurrent = mockHistoryRecords.get(sessionId);
      expect(finalHistoryAfterConcurrent).toBeDefined();
      expect(finalHistoryAfterConcurrent?.length).toBe(14); // 8 original + 6 new (3 pairs)

      // 9. Validate model responses contained correct references
      concurrentResults.forEach((result) => {
        expect(result.text).toContain("Response to:");
      });
    });
  });
});
