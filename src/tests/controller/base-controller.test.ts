/**
 * Tests for BaseController class
 *
 * These tests verify the base controller functionality including response methods,
 * error handling, and request handling utilities.
 */

import { BaseController, CrudController } from "../../class/base/base-controller.class";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { APP_ERROR_CODE } from "../../data/enums/error-codes.enum";

// Test implementation of BaseController
class TestController extends BaseController {
  // Expose protected methods for testing
  public testSendSuccess(reply: FastifyReply, content: string, metadata?: Record<string, unknown>, statusCode?: number) {
    return this.sendSuccess(reply, content, metadata, statusCode);
  }

  public testSendError(reply: FastifyReply, content: string, metadata?: Record<string, unknown>, statusCode?: number, errorCode?: APP_ERROR_CODE) {
    return this.sendError(reply, content, metadata, statusCode, errorCode);
  }

  public testHandleRequest<T>(reply: FastifyReply, handler: () => Promise<T>, successMessage: string, errorMessage?: string, errorCode?: APP_ERROR_CODE) {
    return this.handleRequest(reply, handler, successMessage, errorMessage, errorCode);
  }
}

// Test implementation of CrudController
interface TestEntity {
  id: number;
  name: string;
  email?: string;
  status?: string;
}

class TestCrudController extends CrudController<TestEntity> {
  private mockData: TestEntity[] = [
    { id: 1, name: "Test User 1", email: "test1@example.com", status: "active" },
    { id: 2, name: "Test User 2", email: "test2@example.com", status: "inactive" },
  ];

  protected createSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    email: z.string().email().optional(),
    status: z.string().optional(),
  }) as z.ZodSchema<TestEntity>;

  protected updateSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    status: z.string().optional(),
  }) as z.ZodSchema<Partial<TestEntity>>;

  protected async getAll(): Promise<TestEntity[]> {
    return this.mockData;
  }

  protected async getById(id: string | number): Promise<TestEntity | null> {
    const numId = typeof id === "string" ? parseInt(id, 10) : id;
    return this.mockData.find((item) => item.id === numId) || null;
  }

  protected async create(data: Partial<TestEntity>): Promise<TestEntity> {
    const newItem: TestEntity = {
      id: Math.max(...this.mockData.map((d) => d.id)) + 1,
      name: data.name!,
      email: data.email,
      status: data.status || "active",
    };
    this.mockData.push(newItem);
    return newItem;
  }

  protected async update(id: string | number, data: Partial<TestEntity>): Promise<TestEntity | null> {
    const numId = typeof id === "string" ? parseInt(id, 10) : id;
    const index = this.mockData.findIndex((item) => item.id === numId);
    if (index === -1) return null;

    this.mockData[index] = { ...this.mockData[index], ...data };
    return this.mockData[index];
  }

  protected async delete(id: string | number): Promise<boolean> {
    const numId = typeof id === "string" ? parseInt(id, 10) : id;
    const index = this.mockData.findIndex((item) => item.id === numId);
    if (index === -1) return false;

    this.mockData.splice(index, 1);
    return true;
  }

  // Expose protected methods for testing
  public testGetServiceName(): string {
    return this.serviceName;
  }
}

// Mock Fastify Reply
function createMockReply(): FastifyReply {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

// Mock Fastify Request
function createMockRequest<T = Record<string, unknown>>(data: Partial<T> = {}): FastifyRequest {
  return {
    body: data,
    params: {},
    query: {},
    ...data,
  } as unknown as FastifyRequest;
}

describe("BaseController", () => {
  let controller: TestController;
  let mockReply: FastifyReply;

  beforeEach(() => {
    controller = new TestController();
    mockReply = createMockReply();
    jest.clearAllMocks();
  });

  describe("sendSuccess", () => {
    it("should send success response with default status code", () => {
      const content = "Operation successful";
      const metadata = { userId: 123 };

      controller.testSendSuccess(mockReply, content, metadata);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content,
        timestamp: expect.any(String),
        status: "success",
        metadata,
      });
    });

    it("should send success response with custom status code", () => {
      const content = "Resource created";
      const statusCode = 201;

      controller.testSendSuccess(mockReply, content, {}, statusCode);

      expect(mockReply.status).toHaveBeenCalledWith(statusCode);
      expect(mockReply.send).toHaveBeenCalledWith({
        content,
        timestamp: expect.any(String),
        status: "success",
        metadata: {},
      });
    });

    it("should include timestamp in ISO format", () => {
      const content = "Test message";
      const beforeCall = new Date().toISOString();

      controller.testSendSuccess(mockReply, content);

      const afterCall = new Date().toISOString();
      const callArgs = (mockReply.send as jest.Mock).mock.calls[0][0];

      expect(callArgs.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(callArgs.timestamp >= beforeCall).toBe(true);
      expect(callArgs.timestamp <= afterCall).toBe(true);
    });
  });

  describe("sendError", () => {
    it("should send error response with default status code", () => {
      const content = "An error occurred";
      const metadata = { field: "email" };

      controller.testSendError(mockReply, content, metadata);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        content,
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          ...metadata,
          errorCode: APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
        },
      });
    });

    it("should send error response with custom status code and error code", () => {
      const content = "Resource not found";
      const statusCode = 404;
      const errorCode = APP_ERROR_CODE.NOT_FOUND;

      controller.testSendError(mockReply, content, {}, statusCode, errorCode);

      expect(mockReply.status).toHaveBeenCalledWith(statusCode);
      expect(mockReply.send).toHaveBeenCalledWith({
        content,
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode,
        },
      });
    });

    it("should log error messages", () => {
      const content = "Database connection failed";
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      controller.testSendError(mockReply, content);

      // Note: This test assumes the Logger class logs to console.error
      // You might need to adjust based on your Logger implementation
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("handleRequest", () => {
    it("should handle successful async operations", async () => {
      const mockHandler = jest.fn().mockResolvedValue({ id: 1, name: "Test" });
      const successMessage = "Operation completed";

      await controller.testHandleRequest(mockReply, mockHandler, successMessage);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: successMessage,
        timestamp: expect.any(String),
        status: "success",
        metadata: { data: { id: 1, name: "Test" } },
      });
    });

    it("should handle async operation errors", async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error("Database error"));
      const successMessage = "Operation completed";
      const errorMessage = "Operation failed";

      await controller.testHandleRequest(mockReply, mockHandler, successMessage, errorMessage);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "Database error",
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode: APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
        },
      });
    });

    it("should use default error message for non-Error objects", async () => {
      const mockHandler = jest.fn().mockRejectedValue("String error");
      const successMessage = "Operation completed";
      const errorMessage = "Default error message";

      await controller.testHandleRequest(mockReply, mockHandler, successMessage, errorMessage);

      expect(mockReply.send).toHaveBeenCalledWith({
        content: errorMessage,
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode: APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
        },
      });
    });

    it("should use custom error code when provided", async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error("Validation failed"));
      const successMessage = "Operation completed";
      const errorMessage = "Validation error";
      const errorCode = APP_ERROR_CODE.VALIDATION_ERROR;

      await controller.testHandleRequest(mockReply, mockHandler, successMessage, errorMessage, errorCode);

      expect(mockReply.send).toHaveBeenCalledWith({
        content: "Validation failed",
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode,
        },
      });
    });
  });
});

describe("CrudController", () => {
  let controller: TestCrudController;
  let mockReply: FastifyReply;

  beforeEach(() => {
    controller = new TestCrudController();
    mockReply = createMockReply();
    jest.clearAllMocks();
  });

  describe("serviceName", () => {
    it("should derive service name from controller class name", () => {
      expect(controller.testGetServiceName()).toBe("TestCrud");
    });
  });

  describe("handleGetAll", () => {
    it("should handle get all request with default pagination", async () => {
      const mockRequest = createMockRequest({
        query: {},
      });

      await controller.handleGetAll(mockRequest as FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud items retrieved successfully",
        timestamp: expect.any(String),
        status: "success",
        metadata: {
          data: {
            items: expect.any(Array),
            total: 2,
            page: 1,
            limit: 10,
          },
        },
      });
    });

    it("should handle get all request with custom pagination", async () => {
      const mockRequest = createMockRequest({
        query: { page: "2", limit: "1" },
      });

      await controller.handleGetAll(mockRequest as FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, mockReply);

      const sendArgs = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendArgs.metadata.data.page).toBe(2);
      expect(sendArgs.metadata.data.limit).toBe(1);
      expect(sendArgs.metadata.data.items).toHaveLength(1);
    });
  });

  describe("handleGetById", () => {
    it("should handle get by id request successfully", async () => {
      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await controller.handleGetById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud item retrieved successfully",
        timestamp: expect.any(String),
        status: "success",
        metadata: {
          data: expect.objectContaining({ id: 1, name: "Test User 1" }),
        },
      });
    });

    it("should handle get by id request for non-existent item", async () => {
      const mockRequest = createMockRequest({
        params: { id: "999" },
      });

      await controller.handleGetById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud item not found",
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode: APP_ERROR_CODE.NOT_FOUND,
        },
      });
    });
  });

  describe("handleCreate", () => {
    it("should handle create request with valid data", async () => {
      const mockRequest = createMockRequest({
        body: { name: "New User", email: "new@example.com" },
      });

      await controller.handleCreate(mockRequest as FastifyRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud created successfully",
        timestamp: expect.any(String),
        status: "success",
        metadata: {
          data: expect.objectContaining({ name: "New User", email: "new@example.com" }),
        },
      });
    });

    it("should handle create request with invalid data (Zod validation)", async () => {
      const mockRequest = createMockRequest({
        body: { email: "invalid-email" }, // missing name, invalid email
      });

      await controller.handleCreate(mockRequest as FastifyRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "Validation failed",
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode: APP_ERROR_CODE.VALIDATION_ERROR,
          errors: expect.any(Array),
        },
      });
    });
  });

  describe("handleUpdate", () => {
    it("should handle update request successfully", async () => {
      const mockRequest = createMockRequest({
        params: { id: "1" },
        body: { name: "Updated User" },
      });

      await controller.handleUpdate(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud updated successfully",
        timestamp: expect.any(String),
        status: "success",
        metadata: {
          data: expect.objectContaining({ id: 1, name: "Updated User" }),
        },
      });
    });

    it("should handle update request for non-existent item", async () => {
      const mockRequest = createMockRequest({
        params: { id: "999" },
        body: { name: "Updated User" },
      });

      await controller.handleUpdate(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud item not found",
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode: APP_ERROR_CODE.NOT_FOUND,
        },
      });
    });

    it("should handle update request with invalid data", async () => {
      const mockRequest = createMockRequest({
        params: { id: "1" },
        body: { email: "invalid-email" },
      });

      await controller.handleUpdate(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "Validation failed",
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode: APP_ERROR_CODE.VALIDATION_ERROR,
          errors: expect.any(Array),
        },
      });
    });
  });

  describe("handleDelete", () => {
    it("should handle delete request successfully", async () => {
      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await controller.handleDelete(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud deleted successfully",
        timestamp: expect.any(String),
        status: "success",
        metadata: {
          data: true,
        },
      });
    });

    it("should handle delete request for non-existent item", async () => {
      const mockRequest = createMockRequest({
        params: { id: "999" },
      });

      await controller.handleDelete(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        content: "TestCrud item not found",
        timestamp: expect.any(String),
        status: "error",
        metadata: {
          errorCode: APP_ERROR_CODE.NOT_FOUND,
        },
      });
    });
  });

  describe("getAllPaginated", () => {
    it("should return paginated results correctly", async () => {
      const result = await controller["getAllPaginated"](2, 1);

      expect(result).toEqual({
        items: [expect.objectContaining({ id: 2, name: "Test User 2" })],
        total: 2,
        page: 2,
        limit: 1,
      });
    });

    it("should handle page beyond available data", async () => {
      const result = await controller["getAllPaginated"](5, 10);

      expect(result).toEqual({
        items: [],
        total: 2,
        page: 5,
        limit: 10,
      });
    });
  });
});
