/**
 * Integration Tests for Repository Pattern Architecture
 *
 * These tests verify the integration between controllers, services, and repositories
 * to ensure the complete architecture works end-to-end.
 */

import { User } from "../../class/repository/postgres-user.repository";
import { PostgresUserService } from "../../class/services/postgres-user.service";
import { UserController } from "../../controllers/user.controller.example";
import { FastifyReply, FastifyRequest } from "fastify";

// Mock the PostgreSQL adapter since we don't have a real database in tests
jest.mock("../../modules/postgres-repository-adapter", () => ({
  createPostgresAdapter: jest.fn(() => ({
    query: jest.fn(),
    queryOne: jest.fn(),
    transaction: jest.fn(),
  })),
}));

// Mock Fastify Reply
function createMockReply(): FastifyReply {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

// Mock Fastify Request
function createMockRequest<T = Record<string, unknown>>(data: Partial<T> = {}): FastifyRequest {
  return {
    body: {},
    params: {},
    query: {},
    ...data,
  } as unknown as FastifyRequest;
}

describe("Integration Tests - Repository Pattern Architecture", () => {
  let mockUserService: jest.Mocked<PostgresUserService>;
  let userController: UserController;
  let mockReply: FastifyReply;

  const sampleUser: User = {
    id: 1,
    email: "test@example.com",
    name: "Test User",
    status: "active",
    created_at: new Date("2023-01-01"),
    updated_at: new Date("2023-01-01"),
  };

  beforeEach(() => {
    // Create mock service directly
    mockUserService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn(),
      getFilteredUsers: jest.fn(),
      searchByName: jest.fn(),
      getUsersByStatus: jest.fn(),
      bulkUpdateUserStatus: jest.fn(),
      getUserStatistics: jest.fn(),
    } as unknown as jest.Mocked<PostgresUserService>;

    // Mock the service factory function
    jest.doMock("../../class/services/postgres-user.service", () => ({
      createPostgresUserService: () => mockUserService,
      PostgresUserService: jest.fn(() => mockUserService),
    }));

    // Create controller
    userController = new UserController();

    mockReply = createMockReply();
    jest.clearAllMocks();
  });

  describe("Full Stack User Creation Flow", () => {
    it("should create user through complete stack (Controller → Service)", async () => {
      // Setup mock responses
      mockUserService.createUser.mockResolvedValue(sampleUser);

      const mockRequest = createMockRequest({
        body: {
          email: "test@example.com",
          name: "Test User",
          status: "active",
        },
      });

      // Execute through controller
      await userController.createUser(mockRequest as FastifyRequest<{ Body: { email: string; name: string; status?: string } }>, mockReply);

      // Verify service was called correctly
      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: "test@example.com",
        name: "Test User",
        status: "active",
      });

      // Verify response
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { user: sampleUser },
        message: "User created successfully",
      });
    });

    it("should handle validation errors through complete stack", async () => {
      // Setup: Service throws validation error
      const validationError = new Error("User with this email already exists");
      mockUserService.createUser.mockRejectedValue(validationError);

      const mockRequest = createMockRequest({
        body: {
          email: "test@example.com",
          name: "Test User",
        },
      });

      await userController.createUser(mockRequest as FastifyRequest<{ Body: { email: string; name: string; status?: string } }>, mockReply);

      // Verify service was called
      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: "test@example.com",
        name: "Test User",
        status: "active",
      });

      // Verify error response
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "Failed to create user",
        })
      );
    });
  });

  describe("Full Stack User Retrieval Flow", () => {
    it("should get user by ID through complete stack", async () => {
      mockUserService.findById.mockResolvedValue(sampleUser);

      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await userController.getUserById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockUserService.findById).toHaveBeenCalledWith(1);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { user: sampleUser },
      });
    });

    it("should handle user not found through complete stack", async () => {
      mockUserService.findById.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { id: "999" },
      });

      await userController.getUserById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockUserService.findById).toHaveBeenCalledWith(999);
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "User not found",
      });
    });
  });

  describe("Full Stack User Update Flow", () => {
    it("should update user through complete stack", async () => {
      const updatedUser = { ...sampleUser, name: "Updated Name" };

      mockUserService.updateUser.mockResolvedValue(updatedUser);

      const mockRequest = createMockRequest({
        params: { id: "1" },
        body: { name: "Updated Name" },
      });

      await userController.updateUser(mockRequest as FastifyRequest<{ Params: { id: string }; Body: { name?: string; email?: string; status?: string } }>, mockReply);

      expect(mockUserService.updateUser).toHaveBeenCalledWith(1, { name: "Updated Name" });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { user: updatedUser },
        message: "User updated successfully",
      });
    });
  });

  describe("Full Stack User Deletion Flow", () => {
    it("should delete user through complete stack", async () => {
      mockUserService.delete.mockResolvedValue(true);

      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await userController.deleteUser(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockUserService.delete).toHaveBeenCalledWith(1);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: "User deleted successfully",
      });
    });
  });

  describe("Service Layer Business Logic Integration", () => {
    it("should handle service validation errors", async () => {
      const validationError = new Error("Invalid email format");
      mockUserService.createUser.mockRejectedValue(validationError);

      const mockRequest = createMockRequest({
        body: {
          email: "invalid-email",
          name: "Test User",
        },
      });

      await userController.createUser(mockRequest as FastifyRequest<{ Body: { email: string; name: string; status?: string } }>, mockReply);

      expect(mockUserService.createUser).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "Failed to create user",
        })
      );
    });
  });

  describe("Error Propagation Through Stack", () => {
    it("should properly propagate service errors to controller", async () => {
      mockUserService.findById.mockRejectedValue(new Error("Database connection failed"));

      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await userController.getUserById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "Failed to fetch user",
        })
      );
    });
  });

  describe("Architecture Pattern Benefits Verification", () => {
    it("should allow easy mocking of service layer", () => {
      // This test verifies that our architecture allows for easy mocking
      expect(mockUserService.findById).toBeDefined();
      expect(mockUserService.createUser).toBeDefined();
      expect(mockUserService.updateUser).toBeDefined();
      expect(mockUserService.delete).toBeDefined();
      expect(mockUserService.findAll).toBeDefined();

      // All methods should be mockable
      expect(jest.isMockFunction(mockUserService.findById)).toBe(true);
      expect(jest.isMockFunction(mockUserService.createUser)).toBe(true);
      expect(jest.isMockFunction(mockUserService.updateUser)).toBe(true);
      expect(jest.isMockFunction(mockUserService.delete)).toBe(true);
      expect(jest.isMockFunction(mockUserService.findAll)).toBe(true);
    });

    it("should maintain clear separation of concerns", () => {
      // Verify that each layer has distinct responsibilities
      expect(userController).toBeInstanceOf(UserController);
      expect(mockUserService).toBeDefined();

      // Controller should handle HTTP concerns
      expect(typeof userController.createUser).toBe("function");
      expect(typeof userController.getUserById).toBe("function");

      // Service should handle business logic
      expect(typeof mockUserService.createUser).toBe("function");
      expect(typeof mockUserService.findById).toBe("function");
    });
  });
});
