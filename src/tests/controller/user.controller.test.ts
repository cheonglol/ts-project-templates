/**
 * Tests for UserController class
 *
 * These tests verify the UserController functionality including CRUD operations,
 * custom methods, validation, and error handling.
 */

import { UserController } from "../../controllers/user.controller.example";
import { User } from "../../class/repository/postgres-user.repository";
import { FastifyReply, FastifyRequest } from "fastify";
import { ValidationError, DatabaseError, ErrorCode } from "../../class/common/errors.class";
import { PostgresUserService } from "../../class/services/postgres-user.service";

// Type definitions for request parameters
interface GetUsersQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  created_after?: string;
}

interface CreateUserRequest {
  email: string;
  name: string;
  status?: string;
}

interface UpdateUserRequest {
  email?: string;
  name?: string;
  status?: string;
}

interface BulkUpdateRequest {
  userIds: number[];
  status: string;
}

interface UserStatsQuery {
  start_date?: string;
  end_date?: string;
}

// Mock the service
jest.mock("../../class/services/postgres-user.service");

// Mock data
const mockUsers: User[] = [
  {
    id: 1,
    email: "user1@example.com",
    name: "User One",
    status: "active",
    created_at: new Date("2023-01-01"),
    updated_at: new Date("2023-01-01"),
  },
  {
    id: 2,
    email: "user2@example.com",
    name: "User Two",
    status: "inactive",
    created_at: new Date("2023-01-02"),
    updated_at: new Date("2023-01-02"),
  },
];

// Mock service implementation
const mockUserService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  delete: jest.fn(),
  getFilteredUsers: jest.fn(),
  bulkUpdateUserStatus: jest.fn(),
  getUserStatistics: jest.fn(),
  searchByName: jest.fn(),
} as unknown as jest.Mocked<PostgresUserService>;

// Mock factory function
jest.mock("../../class/services/postgres-user.service", () => ({
  createPostgresUserService: jest.fn(() => mockUserService),
  PostgresUserService: jest.fn().mockImplementation(() => mockUserService),
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

describe("UserController", () => {
  let controller: UserController;
  let mockReply: FastifyReply;

  beforeEach(() => {
    controller = new UserController();
    mockReply = createMockReply();
    jest.clearAllMocks();
  });

  describe("getUsers", () => {
    it("should get users with default parameters", async () => {
      const expectedResult = {
        items: mockUsers,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockUserService.getFilteredUsers.mockResolvedValue(expectedResult);

      const mockRequest = createMockRequest({
        query: {},
      });

      await controller.getUsers(mockRequest as FastifyRequest<{ Querystring: GetUsersQuery }>, mockReply);

      expect(mockUserService.getFilteredUsers).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        status: undefined,
        namePattern: undefined,
        createdAfter: undefined,
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expectedResult,
      });
    });

    it("should get users with custom filters", async () => {
      const expectedResult = {
        items: [mockUsers[0]],
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
      };

      mockUserService.getFilteredUsers.mockResolvedValue(expectedResult);

      const mockRequest = createMockRequest({
        query: {
          page: "1",
          limit: "5",
          status: "active",
          search: "User",
          created_after: "2023-01-01",
        },
      });

      await controller.getUsers(mockRequest as FastifyRequest<{ Querystring: GetUsersQuery }>, mockReply);

      expect(mockUserService.getFilteredUsers).toHaveBeenCalledWith({
        page: 1,
        limit: 5,
        status: "active",
        namePattern: "User",
        createdAfter: new Date("2023-01-01"),
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expectedResult,
      });
    });

    it("should handle service errors", async () => {
      mockUserService.getFilteredUsers.mockRejectedValue(new Error("Database error"));

      const mockRequest = createMockRequest({
        query: {},
      });

      await controller.getUsers(mockRequest as FastifyRequest<{ Querystring: GetUsersQuery }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Failed to fetch users",
        message: "Database error",
      });
    });
  });

  describe("getUserById", () => {
    it("should get user by valid ID", async () => {
      mockUserService.findById.mockResolvedValue(mockUsers[0]);

      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await controller.getUserById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockUserService.findById).toHaveBeenCalledWith(1);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { user: mockUsers[0] },
      });
    });

    it("should handle invalid ID format", async () => {
      const mockRequest = createMockRequest({
        params: { id: "invalid" },
      });

      await controller.getUserById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Invalid user ID format",
      });
    });

    it("should handle user not found", async () => {
      mockUserService.findById.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { id: "999" },
      });

      await controller.getUserById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "User not found",
      });
    });
  });

  describe("getUserByEmail", () => {
    it("should get user by email", async () => {
      mockUserService.findByEmail.mockResolvedValue(mockUsers[0]);

      const mockRequest = createMockRequest({
        params: { email: "user1@example.com" },
      });

      await controller.getUserByEmail(mockRequest as FastifyRequest<{ Params: { email: string } }>, mockReply);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith("user1@example.com");
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { user: mockUsers[0] },
      });
    });

    it("should handle user not found by email", async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { email: "nonexistent@example.com" },
      });

      await controller.getUserByEmail(mockRequest as FastifyRequest<{ Params: { email: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "User not found",
      });
    });
  });

  describe("createUser", () => {
    it("should create user with valid data", async () => {
      const newUser: User = {
        id: 3,
        email: "newuser@example.com",
        name: "New User",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockUserService.createUser.mockResolvedValue(newUser);

      const mockRequest = createMockRequest({
        body: {
          email: "newuser@example.com",
          name: "New User",
          status: "active",
        },
      });

      await controller.createUser(mockRequest as FastifyRequest<{ Body: CreateUserRequest }>, mockReply);

      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: "newuser@example.com",
        name: "New User",
        status: "active",
      });

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { user: newUser },
        message: "User created successfully",
      });
    });

    it("should create user with default status", async () => {
      const newUser: User = {
        id: 3,
        email: "newuser@example.com",
        name: "New User",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockUserService.createUser.mockResolvedValue(newUser);

      const mockRequest = createMockRequest({
        body: {
          email: "newuser@example.com",
          name: "New User",
        },
      });

      await controller.createUser(mockRequest as FastifyRequest<{ Body: CreateUserRequest }>, mockReply);

      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: "newuser@example.com",
        name: "New User",
        status: "active",
      });
    });

    it("should handle validation errors", async () => {
      const validationError = new ValidationError({
        message: "Email already exists",
        errorCode: ErrorCode.RESOURCE_ALREADY_EXISTS,
        context: { email: "existing@example.com" },
      });

      mockUserService.createUser.mockRejectedValue(validationError);

      const mockRequest = createMockRequest({
        body: {
          email: "existing@example.com",
          name: "Test User",
        },
      });

      await controller.createUser(mockRequest as FastifyRequest<{ Body: CreateUserRequest }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Email already exists",
        code: ErrorCode.RESOURCE_ALREADY_EXISTS,
        context: { email: "existing@example.com" },
      });
    });
  });

  describe("updateUser", () => {
    it("should update user successfully", async () => {
      const updatedUser: User = {
        ...mockUsers[0],
        name: "Updated User",
        updated_at: new Date(),
      };

      mockUserService.updateUser.mockResolvedValue(updatedUser);

      const mockRequest = createMockRequest({
        params: { id: "1" },
        body: { name: "Updated User" },
      });

      await controller.updateUser(mockRequest as FastifyRequest<{ Params: { id: string }; Body: UpdateUserRequest }>, mockReply);

      expect(mockUserService.updateUser).toHaveBeenCalledWith(1, { name: "Updated User" });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { user: updatedUser },
        message: "User updated successfully",
      });
    });

    it("should handle invalid ID format for update", async () => {
      const mockRequest = createMockRequest({
        params: { id: "invalid" },
        body: { name: "Updated User" },
      });

      await controller.updateUser(mockRequest as FastifyRequest<{ Params: { id: string }; Body: UpdateUserRequest }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Invalid user ID format",
      });
    });

    it("should handle user not found for update", async () => {
      mockUserService.updateUser.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { id: "999" },
        body: { name: "Updated User" },
      });

      await controller.updateUser(mockRequest as FastifyRequest<{ Params: { id: string }; Body: UpdateUserRequest }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "User not found",
      });
    });
  });

  describe("deleteUser", () => {
    it("should delete user successfully", async () => {
      mockUserService.delete.mockResolvedValue(true);

      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await controller.deleteUser(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockUserService.delete).toHaveBeenCalledWith(1);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: "User deleted successfully",
      });
    });

    it("should handle invalid ID format for delete", async () => {
      const mockRequest = createMockRequest({
        params: { id: "invalid" },
      });

      await controller.deleteUser(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Invalid user ID format",
      });
    });

    it("should handle user not found for delete", async () => {
      mockUserService.delete.mockResolvedValue(false);

      const mockRequest = createMockRequest({
        params: { id: "999" },
      });

      await controller.deleteUser(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "User not found",
      });
    });
  });

  describe("bulkUpdateStatus", () => {
    it("should bulk update user status successfully", async () => {
      const mockResult = { updatedCount: 2, errors: [] };
      mockUserService.bulkUpdateUserStatus.mockResolvedValue(mockResult);

      const mockRequest = createMockRequest({
        body: {
          userIds: [1, 2],
          status: "suspended",
        },
      });

      await controller.bulkUpdateStatus(mockRequest as FastifyRequest<{ Body: BulkUpdateRequest }>, mockReply);

      expect(mockUserService.bulkUpdateUserStatus).toHaveBeenCalledWith([1, 2], "suspended");
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
        message: "Successfully updated 2 users",
      });
    });

    it("should handle invalid bulk update request", async () => {
      const mockRequest = createMockRequest({
        body: {
          userIds: "invalid", // should be array
          status: "suspended",
        },
      });

      await controller.bulkUpdateStatus(mockRequest as FastifyRequest<{ Body: BulkUpdateRequest }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "userIds array and status are required",
      });
    });
  });

  describe("getUserStats", () => {
    it("should get user statistics", async () => {
      const mockStats = {
        totalUsers: 2,
        activeUsers: 1,
        inactiveUsers: 1,
        pendingUsers: 0,
        suspendedUsers: 0,
      };

      mockUserService.getUserStatistics.mockResolvedValue(mockStats);

      const mockRequest = createMockRequest({
        query: {},
      });

      await controller.getUserStats(mockRequest as FastifyRequest<{ Querystring: UserStatsQuery }>, mockReply);

      expect(mockUserService.getUserStatistics).toHaveBeenCalledWith(undefined);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { stats: mockStats },
      });
    });

    it("should get user statistics with date range", async () => {
      const mockStats = {
        totalUsers: 1,
        activeUsers: 1,
        inactiveUsers: 0,
        pendingUsers: 0,
        suspendedUsers: 0,
        usersInDateRange: 1,
      };

      mockUserService.getUserStatistics.mockResolvedValue(mockStats);

      const mockRequest = createMockRequest({
        query: {
          start_date: "2023-01-01",
          end_date: "2023-01-31",
        },
      });

      await controller.getUserStats(mockRequest as FastifyRequest<{ Querystring: UserStatsQuery }>, mockReply);

      expect(mockUserService.getUserStatistics).toHaveBeenCalledWith({
        start: new Date("2023-01-01"),
        end: new Date("2023-01-31"),
      });
    });
  });

  describe("searchUsers", () => {
    it("should search users by name pattern", async () => {
      const searchResults = [mockUsers[0]];
      mockUserService.searchByName.mockResolvedValue(searchResults);

      const mockRequest = createMockRequest({
        params: { pattern: "User One" },
      });

      await controller.searchUsers(mockRequest as FastifyRequest<{ Params: { pattern: string } }>, mockReply);

      expect(mockUserService.searchByName).toHaveBeenCalledWith("User One");
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { users: searchResults },
      });
    });
  });

  describe("error handling", () => {
    it("should handle ValidationError properly", async () => {
      const validationError = new ValidationError({
        message: "Invalid email format",
        errorCode: ErrorCode.INVALID_FORMAT,
        context: { field: "email" },
      });

      mockUserService.createUser.mockRejectedValue(validationError);

      const mockRequest = createMockRequest({
        body: { email: "invalid-email", name: "Test" },
      });

      await controller.createUser(mockRequest as FastifyRequest<{ Body: CreateUserRequest }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Invalid email format",
        code: ErrorCode.INVALID_FORMAT,
        context: { field: "email" },
      });
    });

    it("should handle DatabaseError properly", async () => {
      const databaseError = new DatabaseError({
        message: "Connection failed",
        errorCode: ErrorCode.DATABASE_ERROR,
      });

      mockUserService.findAll.mockRejectedValue(databaseError);

      const mockRequest = createMockRequest({
        query: {},
      });

      await controller.getUsers(mockRequest as FastifyRequest<{ Querystring: GetUsersQuery }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Database operation failed",
        message: "Failed to fetch users",
      });
    });

    it("should handle generic errors properly", async () => {
      const genericError = new Error("Unexpected error");

      mockUserService.findById.mockRejectedValue(genericError);

      const mockRequest = createMockRequest({
        params: { id: "1" },
      });

      await controller.getUserById(mockRequest as FastifyRequest<{ Params: { id: string } }>, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Failed to fetch user",
        message: "Unexpected error",
      });
    });
  });
});
