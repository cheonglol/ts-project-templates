import { FastifyReply, FastifyRequest } from "fastify";
import { HealthCheckController } from "../../class/controllers/healthcheck.controller";
import { Logger } from "../../shared/logging/logger";
import { setupTestEnvironment, teardownTestEnvironment, resetLogger } from "../test-helper";

interface HealthResponse {
  content: string;
  timestamp: string;
  status: string;
  metadata: Record<string, unknown>;
}

describe("HealthCheckController", () => {
  let controller: HealthCheckController;
  let mockReply: {
    status: jest.Mock<FastifyReply, [number]>;
    send: jest.Mock<FastifyReply, [HealthResponse]>;
  };
  let mockRequest: jest.Mocked<FastifyRequest>;

  beforeEach(() => {
    setupTestEnvironment();
    resetLogger();

    controller = new HealthCheckController();

    // Mock Fastify request
    mockRequest = {} as jest.Mocked<FastifyRequest>;

    // Mock Fastify reply with proper typing
    const mockStatus = jest.fn().mockReturnThis();
    const mockSend = jest.fn().mockReturnThis();

    mockReply = {
      status: mockStatus,
      send: mockSend,
    };
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe("checkHealth", () => {
    it("should return basic health status", async () => {
      await controller.checkHealth(mockRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "Service is healthy",
        timestamp: expect.any(String),
        status: "success",
        metadata: {
          status: "UP",
        },
      });
    });

    it("should return valid timestamp format", async () => {
      await controller.checkHealth(mockRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0] as HealthResponse;
      const timestamp = new Date(sentData.timestamp);

      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe("getDetailedHealth", () => {
    beforeEach(() => {
      // Mock process methods
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        rss: 50 * 1024 * 1024, // 50 MB
        heapTotal: 40 * 1024 * 1024, // 40 MB
        heapUsed: 30 * 1024 * 1024, // 30 MB
        external: 0,
        arrayBuffers: 0,
      });

      jest.spyOn(process, "uptime").mockReturnValue(3600); // 1 hour
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should return detailed health information", async () => {
      await controller.getDetailedHealth(mockRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "Health check details",
        timestamp: expect.any(String),
        status: "success",
        metadata: {
          status: "UP",
          uptime: "3600.00 seconds",
          memory: {
            rss: "50 MB",
            heapTotal: "40 MB",
            heapUsed: "30 MB",
          },
        },
      });
    });

    it("should calculate memory usage correctly", async () => {
      // Test with different memory values
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        rss: 25 * 1024 * 1024, // 25 MB
        heapTotal: 20 * 1024 * 1024, // 20 MB
        heapUsed: 15 * 1024 * 1024, // 15 MB
        external: 0,
        arrayBuffers: 0,
      });

      await controller.getDetailedHealth(mockRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0] as HealthResponse;
      expect(sentData.metadata.memory).toEqual({
        rss: "25 MB",
        heapTotal: "20 MB",
        heapUsed: "15 MB",
      });
    });

    it("should format uptime correctly", async () => {
      jest.spyOn(process, "uptime").mockReturnValue(3661.5); // 1 hour, 1 minute, 1.5 seconds

      await controller.getDetailedHealth(mockRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0] as HealthResponse;
      expect(sentData.metadata.uptime).toBe("3661.50 seconds");
    });

    it("should handle zero memory usage", async () => {
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0,
      });

      await controller.getDetailedHealth(mockRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0] as HealthResponse;
      expect(sentData.metadata.memory).toEqual({
        rss: "0 MB",
        heapTotal: "0 MB",
        heapUsed: "0 MB",
      });
    });

    it("should handle zero uptime", async () => {
      jest.spyOn(process, "uptime").mockReturnValue(0);

      await controller.getDetailedHealth(mockRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0] as HealthResponse;
      expect(sentData.metadata.uptime).toBe("0.00 seconds");
    });
  });

  describe("Response Structure", () => {
    it("should always include required response fields", async () => {
      await controller.checkHealth(mockRequest, mockReply as unknown as FastifyReply);

      const response = mockReply.send.mock.calls[0][0] as HealthResponse;

      expect(response).toHaveProperty("content");
      expect(response).toHaveProperty("timestamp");
      expect(response).toHaveProperty("status");
      expect(response).toHaveProperty("metadata");

      expect(typeof response.content).toBe("string");
      expect(typeof response.timestamp).toBe("string");
      expect(response.status).toBe("success");
      expect(typeof response.metadata).toBe("object");
    });

    it("should return ISO timestamp format", async () => {
      await controller.checkHealth(mockRequest, mockReply as unknown as FastifyReply);

      const response = mockReply.send.mock.calls[0][0] as HealthResponse;
      const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

      expect(timestampRegex.test(response.timestamp)).toBe(true);
    });
  });

  describe("Controller Inheritance", () => {
    it("should inherit from BaseController", () => {
      expect(controller).toBeInstanceOf(HealthCheckController);
      // The controller should have access to BaseController methods
      expect(typeof (controller as unknown as { sendSuccess: (...args: unknown[]) => void }).sendSuccess).toBe("function");
    });

    it("should have logger instance", () => {
      // Access the protected logger property through type assertion
      const logger = (controller as unknown as { logger: Logger }).logger;
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});
