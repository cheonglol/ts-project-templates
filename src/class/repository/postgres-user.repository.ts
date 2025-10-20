/**
 * PostgreSQL User Repository Implementation
 *
 * This is a concrete implementation that uses the PostgreSQL adapter
 * to bridge with your existing database connection module.
 */

import { BaseRepository } from "../base/base-repository.class";
import { createPostgresAdapter } from "../../database/postgres-repository-adapter";
import DBConnection from "../../database/pgdb-manager.class";

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
    const knex = DBConnection.getConnection();
    const row = await knex(this.config.tableName).where({ email }).first();
    return row ? this.transformResult(row as User) : null;
  }

  /**
   * Find users by name pattern
   */
  async findByNamePattern(pattern: string): Promise<User[]> {
    const knex = DBConnection.getConnection();
    const rows = await knex(this.config.tableName).whereILike("name", `%${pattern}%`);
    return this.transformResults(rows as User[]);
  }

  /**
   * Find users by status
   */
  async findByStatus(status: string): Promise<User[]> {
    const knex = DBConnection.getConnection();
    const rows = await knex(this.config.tableName).where({ status });
    return this.transformResults(rows as User[]);
  }

  /**
   * Get user count by date range
   */
  async getCountByDateRange(startDate: Date, endDate: Date): Promise<number> {
    const knex = DBConnection.getConnection();
    const qb = knex(this.config.tableName).count<{ total: string }[]>("* as total").whereBetween("created_at", [startDate, endDate]);
    if (this.config.softDelete) qb.whereNull("deleted_at");
    const row = await qb.first();
    const totalStr = row ? (row.total as unknown as string) : "0";
    return parseInt(totalStr, 10) || 0;
  }

  /**
   * Bulk update user status
   */
  async bulkUpdateStatus(userIds: number[], status: string): Promise<number> {
    if (userIds.length === 0) return 0;
    const knex = DBConnection.getConnection();
    const qb = knex(this.config.tableName).whereIn("id", userIds as number[]);
    if (this.config.softDelete) qb.whereNull("deleted_at");
    // Use returning to get affected rows on Postgres
    const updated = await qb.update({ status, updated_at: knex.fn.now() }).returning("id");
    if (Array.isArray(updated)) return updated.length;
    // fallback for drivers returning count
    return typeof updated === "number" ? updated : 0;
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

    // Build query using Knex
    const knex = DBConnection.getConnection();
    const base = knex(this.config.tableName).select("*");
    if (this.config.softDelete) base.whereNull("deleted_at");
    if (status) base.andWhere("status", status);
    if (namePattern) base.andWhere("name", "ilike", `%${namePattern}%`);
    if (createdAfter) base.andWhere("created_at", ">", createdAfter);

    // total
    const countRow = await base.clone().count<{ total: string }[]>("* as total").first();
    const total = countRow ? parseInt((countRow.total as unknown as string) || "0", 10) : 0;

    // items with pagination
    const offset = (page - 1) * limit;
    const items = await base.orderBy("created_at", "desc").limit(limit).offset(offset);

    return {
      items: this.transformResults(items as User[]),
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
