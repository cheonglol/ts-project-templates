/**
 * PostgreSQL User Service Implementation
 *
 * This service uses the PostgreSQL User Repository and provides business logic
 * for user management operations.
 */

import { BaseService } from "../base/base-service.class";
import { PostgresUserRepository, User, createPostgresUserRepository } from "../repository/postgres-user.repository";
import { ValidationError, ErrorCode } from "../common/errors.class";

export class PostgresUserService extends BaseService<User> {
  private userRepository: PostgresUserRepository;

  constructor(userRepository?: PostgresUserRepository) {
    super();
    this.userRepository = userRepository || createPostgresUserRepository();
  }

  /**
   * Get the repository instance
   */
  protected getRepository(): PostgresUserRepository {
    return this.userRepository;
  }

  /**
   * Find user by email with validation
   */
  async findByEmail(email: string): Promise<User | null> {
    if (!email || !this.isValidEmail(email)) {
      throw new ValidationError({
        message: "Invalid email format",
        errorCode: ErrorCode.INVALID_FORMAT,
        context: { email },
      });
    }

    try {
      return await this.userRepository.findByEmail(email.toLowerCase().trim());
    } catch (error) {
      this.handleError(error, `Error finding user by email: ${email}`);
      return null;
    }
  }

  /**
   * Search users by name pattern
   */
  async searchByName(pattern: string): Promise<User[]> {
    if (!pattern || pattern.trim().length < 2) {
      throw new ValidationError({
        message: "Search pattern must be at least 2 characters",
        errorCode: ErrorCode.INVALID_INPUT,
        context: { pattern },
      });
    }

    try {
      return await this.userRepository.findByNamePattern(pattern.trim());
    } catch (error) {
      this.handleError(error, `Error searching users by name: ${pattern}`);
      return [];
    }
  }

  /**
   * Get users by status
   */
  async getUsersByStatus(status: string): Promise<User[]> {
    const validStatuses = ["active", "inactive", "pending", "suspended"];

    if (!validStatuses.includes(status)) {
      throw new ValidationError({
        message: `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
        errorCode: ErrorCode.INVALID_INPUT,
        context: { status, validStatuses },
      });
    }

    try {
      return await this.userRepository.findByStatus(status);
    } catch (error) {
      this.handleError(error, `Error finding users by status: ${status}`);
      return [];
    }
  }

  /**
   * Create user with comprehensive validation
   */
  async createUser(userData: Partial<User>): Promise<User> {
    // Validate required fields
    if (!userData.email || !userData.name) {
      throw new ValidationError({
        message: "Email and name are required",
        errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
        context: userData,
      });
    }

    // Validate email format
    if (!this.isValidEmail(userData.email)) {
      throw new ValidationError({
        message: "Invalid email format",
        errorCode: ErrorCode.INVALID_FORMAT,
        context: { email: userData.email },
      });
    }

    // Validate name length
    if (userData.name.trim().length < 2) {
      throw new ValidationError({
        message: "Name must be at least 2 characters long",
        errorCode: ErrorCode.INVALID_INPUT,
        context: { name: userData.name },
      });
    }

    // Check if user already exists
    const existingUser = await this.findByEmail(userData.email);
    if (existingUser) {
      throw new ValidationError({
        message: "User with this email already exists",
        errorCode: ErrorCode.RESOURCE_ALREADY_EXISTS,
        context: { email: userData.email },
      });
    }

    try {
      // Prepare user data with defaults
      const userToCreate: Partial<User> = {
        ...userData,
        email: userData.email.toLowerCase().trim(),
        name: userData.name.trim(),
        status: userData.status || "active",
      };

      return await this.create(userToCreate);
    } catch (error) {
      this.handleError(error, "Error creating user");
      throw error;
    }
  }

  /**
   * Update user with validation
   */
  async updateUser(id: string | number, userData: Partial<User>): Promise<User | null> {
    // Check if user exists
    const existingUser = await this.findById(id);
    if (!existingUser) {
      return null;
    }

    // Validate email if provided
    if (userData.email && !this.isValidEmail(userData.email)) {
      throw new ValidationError({
        message: "Invalid email format",
        errorCode: ErrorCode.INVALID_FORMAT,
        context: { email: userData.email },
      });
    }

    // Validate name if provided
    if (userData.name && userData.name.trim().length < 2) {
      throw new ValidationError({
        message: "Name must be at least 2 characters long",
        errorCode: ErrorCode.INVALID_INPUT,
        context: { name: userData.name },
      });
    }

    // Check email uniqueness if email is being changed
    if (userData.email && userData.email.toLowerCase() !== existingUser.email) {
      const userWithEmail = await this.findByEmail(userData.email);
      if (userWithEmail && userWithEmail.id !== id) {
        throw new ValidationError({
          message: "User with this email already exists",
          errorCode: ErrorCode.RESOURCE_ALREADY_EXISTS,
          context: { email: userData.email },
        });
      }
    }

    try {
      // Prepare update data
      const updateData: Partial<User> = { ...userData };
      if (updateData.email) {
        updateData.email = updateData.email.toLowerCase().trim();
      }
      if (updateData.name) {
        updateData.name = updateData.name.trim();
      }

      return await this.update(id, updateData);
    } catch (error) {
      this.handleError(error, `Error updating user with id: ${id}`);
      throw error;
    }
  }

  /**
   * Get users with advanced filtering and pagination
   */
  async getFilteredUsers(options: { page?: number; limit?: number; status?: string; namePattern?: string; createdAfter?: Date }): Promise<{
    items: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 10, status, namePattern, createdAfter } = options;

    // Validate pagination parameters
    if (page < 1 || limit < 1) {
      throw new ValidationError({
        message: "Page and limit must be positive numbers",
        errorCode: ErrorCode.INVALID_INPUT,
        context: { page, limit },
      });
    }

    if (limit > 100) {
      throw new ValidationError({
        message: "Limit cannot exceed 100",
        errorCode: ErrorCode.INVALID_INPUT,
        context: { limit },
      });
    }

    // Validate status if provided
    if (status) {
      const validStatuses = ["active", "inactive", "pending", "suspended"];
      if (!validStatuses.includes(status)) {
        throw new ValidationError({
          message: `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
          errorCode: ErrorCode.INVALID_INPUT,
          context: { status },
        });
      }
    }

    try {
      const result = await this.userRepository.findWithFilters({
        page,
        limit,
        status,
        namePattern,
        createdAfter,
      });

      const totalPages = Math.ceil(result.total / limit);

      return {
        ...result,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      this.handleError(error, "Error getting filtered users");
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }

  /**
   * Bulk update user status with validation
   */
  async bulkUpdateUserStatus(
    userIds: number[],
    status: string
  ): Promise<{
    updatedCount: number;
    errors: string[];
  }> {
    if (!userIds.length) {
      throw new ValidationError({
        message: "User IDs array cannot be empty",
        errorCode: ErrorCode.INVALID_INPUT,
        context: { userIds },
      });
    }

    const validStatuses = ["active", "inactive", "pending", "suspended"];
    if (!validStatuses.includes(status)) {
      throw new ValidationError({
        message: `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
        errorCode: ErrorCode.INVALID_INPUT,
        context: { status },
      });
    }

    const errors: string[] = [];
    let updatedCount = 0;

    try {
      // Verify all users exist
      const existingUsers = await Promise.all(userIds.map((id) => this.findById(id)));

      const nonExistentIds = userIds.filter((id, index) => !existingUsers[index]);
      if (nonExistentIds.length > 0) {
        errors.push(`Users not found: ${nonExistentIds.join(", ")}`);
      }

      const validIds = userIds.filter((id, index) => existingUsers[index]);

      if (validIds.length > 0) {
        updatedCount = await this.userRepository.bulkUpdateStatus(validIds, status);
      }

      return { updatedCount, errors };
    } catch (error) {
      this.handleError(error, "Error bulk updating user status");
      throw error;
    }
  }

  /**
   * Get comprehensive user statistics
   */
  async getUserStatistics(dateRange?: { start: Date; end: Date }): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    pendingUsers: number;
    suspendedUsers: number;
    usersInDateRange?: number;
  }> {
    try {
      const [allUsers, activeUsers, inactiveUsers, pendingUsers, suspendedUsers] = await Promise.all([
        this.findAll(),
        this.getUsersByStatus("active"),
        this.getUsersByStatus("inactive"),
        this.getUsersByStatus("pending"),
        this.getUsersByStatus("suspended"),
      ]);

      const stats = {
        totalUsers: allUsers.length,
        activeUsers: activeUsers.length,
        inactiveUsers: inactiveUsers.length,
        pendingUsers: pendingUsers.length,
        suspendedUsers: suspendedUsers.length,
      };

      // Add date range statistics if provided
      if (dateRange) {
        const usersInDateRange = await this.userRepository.getCountByDateRange(dateRange.start, dateRange.end);
        return { ...stats, usersInDateRange };
      }

      return stats;
    } catch (error) {
      this.handleError(error, "Error getting user statistics");
      return {
        totalUsers: 0,
        activeUsers: 0,
        inactiveUsers: 0,
        pendingUsers: 0,
        suspendedUsers: 0,
        usersInDateRange: dateRange ? 0 : undefined,
      };
    }
  }

  /**
   * Private helper to validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Factory function to create a PostgreSQL User Service
 */
export function createPostgresUserService(userRepository?: PostgresUserRepository): PostgresUserService {
  return new PostgresUserService(userRepository);
}

/**
 * Example usage:
 *
 * // Create service
 * const userService = createPostgresUserService();
 *
 * // Basic operations
 * const users = await userService.findAll();
 * const user = await userService.findById(1);
 * const userByEmail = await userService.findByEmail('user@example.com');
 *
 * // Create user with validation
 * const newUser = await userService.createUser({
 *   email: 'newuser@example.com',
 *   name: 'New User',
 *   status: 'active'
 * });
 *
 * // Advanced filtering
 * const filteredUsers = await userService.getFilteredUsers({
 *   page: 1,
 *   limit: 20,
 *   status: 'active',
 *   namePattern: 'John',
 *   createdAfter: new Date('2023-01-01')
 * });
 *
 * // Bulk operations
 * const bulkResult = await userService.bulkUpdateUserStatus([1, 2, 3], 'inactive');
 * console.log(`Updated ${bulkResult.updatedCount} users`);
 *
 * // Statistics
 * const stats = await userService.getUserStatistics({
 *   start: new Date('2023-01-01'),
 *   end: new Date('2023-12-31')
 * });
 */
