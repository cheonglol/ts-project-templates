/**
 * User Controller using PostgreSQL Repository Pattern
 *
 * This controller extends BaseController and demonstrates how to use the PostgreSQL
 * repository pattern with your existing database connection in a Fastify application.
 */

import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CrudController } from "../class/base/base-controller.class";
import { DatabaseError, ValidationError } from "../class/common/errors.class";
import { User } from "../class/repository/postgres-user.repository";
import { createPostgresUserService, PostgresUserService } from "../class/services/postgres-user.service";

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

interface GetUsersQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  created_after?: string;
}

// Validation schemas
const createUserSchema = z.object({
  id: z.number().optional(),
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  status: z.enum(["active", "inactive", "pending", "suspended"]).optional().default("active"),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  deleted_at: z.date().optional(),
}) as z.ZodSchema<User>;

const updateUserSchema = z.object({
  email: z.string().email("Invalid email format").optional(),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  status: z.enum(["active", "inactive", "pending", "suspended"]).optional(),
}) as z.ZodSchema<Partial<User>>;

export class UserController extends CrudController<User> {
  private userService: PostgresUserService;

  // Required by CrudController
  protected createSchema = createUserSchema;
  protected updateSchema = updateUserSchema;

  constructor() {
    super();
    this.userService = createPostgresUserService();
  }

  // Implement required CRUD methods from CrudController
  protected async getAll(): Promise<User[]> {
    return await this.userService.findAll();
  }

  protected async getById(id: string | number): Promise<User | null> {
    return await this.userService.findById(id);
  }

  protected async create(data: Partial<User>): Promise<User> {
    return await this.userService.createUser(data);
  }

  protected async update(id: string | number, data: Partial<User>): Promise<User | null> {
    return await this.userService.updateUser(id, data);
  }

  protected async delete(id: string | number): Promise<boolean> {
    return await this.userService.delete(id);
  }

  // Override getAllPaginated to use the service's advanced filtering
  protected async getAllPaginated(page: number, limit: number): Promise<{ items: User[]; total: number; page: number; limit: number }> {
    const result = await this.userService.getFilteredUsers({ page, limit });
    return {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * GET /users - Get all users with optional filtering and pagination
   */
  async getUsers(request: FastifyRequest<{ Querystring: GetUsersQuery }>, reply: FastifyReply) {
    try {
      const { page = "1", limit = "10", status, search, created_after } = request.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const createdAfter = created_after ? new Date(created_after) : undefined;

      const result = await this.userService.getFilteredUsers({
        page: pageNum,
        limit: limitNum,
        status,
        namePattern: search,
        createdAfter,
      });

      reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to fetch users");
    }
  }

  /**
   * GET /users/:id - Get user by ID
   */
  async getUserById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const userId = parseInt(request.params.id, 10);

      if (isNaN(userId)) {
        reply.status(400).send({
          success: false,
          error: "Invalid user ID format",
        });
        return;
      }

      const user = await this.userService.findById(userId);

      if (!user) {
        reply.status(404).send({
          success: false,
          error: "User not found",
        });
        return;
      }

      reply.send({
        success: true,
        data: { user },
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to fetch user");
    }
  }

  /**
   * GET /users/email/:email - Get user by email
   */
  async getUserByEmail(request: FastifyRequest<{ Params: { email: string } }>, reply: FastifyReply) {
    try {
      const user = await this.userService.findByEmail(request.params.email);

      if (!user) {
        reply.status(404).send({
          success: false,
          error: "User not found",
        });
        return;
      }

      reply.send({
        success: true,
        data: { user },
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to fetch user by email");
    }
  }

  /**
   * POST /users - Create a new user
   */
  async createUser(request: FastifyRequest<{ Body: CreateUserRequest }>, reply: FastifyReply) {
    try {
      const userData: Partial<User> = {
        email: request.body.email,
        name: request.body.name,
        status: request.body.status || "active",
      };

      const user = await this.userService.createUser(userData);

      reply.status(201).send({
        success: true,
        data: { user },
        message: "User created successfully",
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to create user");
    }
  }

  /**
   * PUT /users/:id - Update user
   */
  async updateUser(request: FastifyRequest<{ Params: { id: string }; Body: UpdateUserRequest }>, reply: FastifyReply) {
    try {
      const userId = parseInt(request.params.id, 10);

      if (isNaN(userId)) {
        reply.status(400).send({
          success: false,
          error: "Invalid user ID format",
        });
        return;
      }

      const updateData: Partial<User> = {};
      if (request.body.email) updateData.email = request.body.email;
      if (request.body.name) updateData.name = request.body.name;
      if (request.body.status) updateData.status = request.body.status;

      const user = await this.userService.updateUser(userId, updateData);

      if (!user) {
        reply.status(404).send({
          success: false,
          error: "User not found",
        });
        return;
      }

      reply.send({
        success: true,
        data: { user },
        message: "User updated successfully",
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to update user");
    }
  }

  /**
   * DELETE /users/:id - Delete user (soft delete)
   */
  async deleteUser(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const userId = parseInt(request.params.id, 10);

      if (isNaN(userId)) {
        reply.status(400).send({
          success: false,
          error: "Invalid user ID format",
        });
        return;
      }

      const deleted = await this.userService.delete(userId);

      if (!deleted) {
        reply.status(404).send({
          success: false,
          error: "User not found",
        });
        return;
      }

      reply.send({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to delete user");
    }
  }

  /**
   * PATCH /users/bulk-status - Bulk update user status
   */
  async bulkUpdateStatus(request: FastifyRequest<{ Body: { userIds: number[]; status: string } }>, reply: FastifyReply) {
    try {
      const { userIds, status } = request.body;

      if (!Array.isArray(userIds) || !status) {
        reply.status(400).send({
          success: false,
          error: "userIds array and status are required",
        });
        return;
      }

      const result = await this.userService.bulkUpdateUserStatus(userIds, status);

      reply.send({
        success: true,
        data: result,
        message: `Successfully updated ${result.updatedCount} users`,
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to bulk update user status");
    }
  }

  /**
   * GET /users/stats - Get user statistics
   */
  async getUserStats(request: FastifyRequest<{ Querystring: { start_date?: string; end_date?: string } }>, reply: FastifyReply) {
    try {
      let dateRange: { start: Date; end: Date } | undefined;

      if (request.query.start_date && request.query.end_date) {
        dateRange = {
          start: new Date(request.query.start_date),
          end: new Date(request.query.end_date),
        };
      }

      const stats = await this.userService.getUserStatistics(dateRange);

      reply.send({
        success: true,
        data: { stats },
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to fetch user statistics");
    }
  }

  /**
   * GET /users/search/:pattern - Search users by name pattern
   */
  async searchUsers(request: FastifyRequest<{ Params: { pattern: string } }>, reply: FastifyReply) {
    try {
      const users = await this.userService.searchByName(request.params.pattern);

      reply.send({
        success: true,
        data: { users },
      });
    } catch (error) {
      this.handleError(error, reply, "Failed to search users");
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: unknown, reply: FastifyReply, defaultMessage: string) {
    if (error instanceof ValidationError) {
      reply.status(400).send({
        success: false,
        error: error.message,
        code: error.errorCode,
        context: error.context,
      });
    } else if (error instanceof DatabaseError) {
      reply.status(500).send({
        success: false,
        error: "Database operation failed",
        message: defaultMessage,
      });
    } else {
      reply.status(500).send({
        success: false,
        error: defaultMessage,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

/**
 * Factory function to create a user controller
 */
export function createUserController(): UserController {
  return new UserController();
}

/**
 * Example route registration:
 *
 * import { FastifyInstance } from 'fastify';
 * import { createUserController } from './controllers/user.controller.example';
 *
 * export async function userRoutes(fastify: FastifyInstance) {
 *   const userController = createUserController();
 *
 *   // User CRUD routes
 *   fastify.get('/users', userController.getUsers.bind(userController));
 *   fastify.get('/users/:id', userController.getUserById.bind(userController));
 *   fastify.get('/users/email/:email', userController.getUserByEmail.bind(userController));
 *   fastify.post('/users', userController.createUser.bind(userController));
 *   fastify.put('/users/:id', userController.updateUser.bind(userController));
 *   fastify.delete('/users/:id', userController.deleteUser.bind(userController));
 *
 *   // Additional routes
 *   fastify.patch('/users/bulk-status', userController.bulkUpdateStatus.bind(userController));
 *   fastify.get('/users/stats', userController.getUserStats.bind(userController));
 *   fastify.get('/users/search/:pattern', userController.searchUsers.bind(userController));
 * }
 */
