/**
 * PostgreSQL User Repository Implementation
 *
 * This is a concrete implementation that uses the PostgreSQL adapter
 * to bridge with your existing database connection module.
 */

import { BaseRepository } from "../base/base-repository.class";
import { createPostgresAdapter } from "../../shared/postgres-repository-adapter";

// User entity interface for PostgreSQL
export interface User extends Record<string, unknown> {
  id: number;
  email: string;
  name: string;
  status?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;

  // Extended profile fields (optional for backward compatibility)
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  timezone?: string;
  locale?: string;
  last_login_at?: Date;
  email_verified_at?: Date;
  is_admin?: boolean;
}

/**
 * PostgreSQL User Repository
 */
export class PostgresUserRepository extends BaseRepository<User> {
  constructor() {
    const pgAdapter = createPostgresAdapter();
    super(pgAdapter, {
      tableName: "users",
      primaryKey: "id",
      timestamps: true,
      softDelete: true,
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const sql = this.buildSelectSql() + " AND email = $1";
    return await this.queryOne<User>(sql, [email]);
  }

  /**
   * Find users by name pattern
   */
  async findByNamePattern(pattern: string): Promise<User[]> {
    const sql = this.buildSelectSql() + " AND name ILIKE $1";
    return await this.query<User>(sql, [`%${pattern}%`]);
  }

  /**
   * Find users by status
   */
  async findByStatus(status: string): Promise<User[]> {
    const sql = this.buildSelectSql() + " AND status = $1";
    return await this.query<User>(sql, [status]);
  }

  /**
   * Get user count by date range
   */
  async getCountByDateRange(startDate: Date, endDate: Date): Promise<number> {
    let sql = `
      SELECT COUNT(*) as total 
      FROM ${this.config.tableName} 
      WHERE created_at BETWEEN $1 AND $2
    `;

    if (this.config.softDelete) {
      sql += " AND deleted_at IS NULL";
    }

    const result = await this.queryOne<{ total: string }>(sql, [startDate, endDate]);
    return result ? parseInt(result.total, 10) : 0;
  }

  /**
   * Bulk update user status
   */
  async bulkUpdateStatus(userIds: number[], status: string): Promise<number> {
    if (userIds.length === 0) return 0;

    // Create PostgreSQL-style parameter placeholders
    const placeholders = userIds.map((_, index) => `$${index + 2}`).join(",");

    let sql = `
      UPDATE ${this.config.tableName} 
      SET status = $1, updated_at = NOW()
      WHERE id IN (${placeholders})
    `;

    if (this.config.softDelete) {
      sql += " AND deleted_at IS NULL";
    }

    const result = await this.connection.execute(sql, [status, ...userIds]);
    return result.affectedRows;
  }

  /**
   * Get users with pagination and optional filtering
   */
  async findWithFilters(options: { page: number; limit: number; status?: string; namePattern?: string; createdAfter?: Date }): Promise<{ items: User[]; total: number }> {
    const { page, limit, status, namePattern, createdAfter } = options;

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (this.config.softDelete) {
      conditions.push("deleted_at IS NULL");
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (namePattern) {
      conditions.push(`name ILIKE $${paramIndex++}`);
      params.push(`%${namePattern}%`);
    }

    if (createdAfter) {
      conditions.push(`created_at > $${paramIndex++}`);
      params.push(createdAfter);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM ${this.config.tableName} ${whereClause}`;
    const countResult = await this.queryOne<{ total: string }>(countSql, params);
    const total = countResult ? parseInt(countResult.total, 10) : 0;

    // Get paginated items
    const offset = (page - 1) * limit;
    const dataSql = `
      SELECT * FROM ${this.config.tableName} 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const items = await this.query<User>(dataSql, [...params, limit, offset]);

    return {
      items: this.transformResults(items),
      total,
    };
  }

  /**
   * Custom transformation for PostgreSQL User objects
   */
  protected transformResult(result: User): User {
    return {
      ...result,
      // Ensure dates are properly converted
      created_at: new Date(result.created_at),
      updated_at: new Date(result.updated_at),
      deleted_at: result.deleted_at ? new Date(result.deleted_at) : undefined,
      last_login_at: result.last_login_at ? new Date(result.last_login_at) : undefined,
      email_verified_at: result.email_verified_at ? new Date(result.email_verified_at) : undefined,
    };
  }
}

/**
 * Factory function to create a PostgreSQL User Repository
 */
export function createPostgresUserRepository(): PostgresUserRepository {
  return new PostgresUserRepository();
}

/**
 * Example usage:
 *
 * // Create repository
 * const userRepository = createPostgresUserRepository();
 *
 * // Basic CRUD operations
 * const users = await userRepository.findAll();
 * const user = await userRepository.findById(1);
 * const newUser = await userRepository.create({
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   status: 'active'
 * });
 *
 * // Custom methods
 * const userByEmail = await userRepository.findByEmail('user@example.com');
 * const activeUsers = await userRepository.findByStatus('active');
 * const usersByName = await userRepository.findByNamePattern('John');
 *
 * // Advanced filtering with pagination
 * const filteredUsers = await userRepository.findWithFilters({
 *   page: 1,
 *   limit: 10,
 *   status: 'active',
 *   namePattern: 'John',
 *   createdAfter: new Date('2023-01-01')
 * });
 *
 * // Bulk operations
 * const updatedCount = await userRepository.bulkUpdateStatus([1, 2, 3], 'inactive');
 *
 * // Statistics
 * const userCount = await userRepository.getCountByDateRange(
 *   new Date('2023-01-01'),
 *   new Date('2023-12-31')
 * );
 */
