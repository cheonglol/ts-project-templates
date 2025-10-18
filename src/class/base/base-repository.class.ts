import { Logger } from "../../shared/logging/logger";
import { DatabaseError, ValidationError, ErrorCode } from "../common/errors.class";
import { LoggingTags } from "../../data/enums/logging-tags.enum";
import { Repository } from "./base-service.class";

export interface DatabaseConnection {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: number | string }>;
  transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T>;
}

export interface RepositoryConfig {
  tableName: string;
  primaryKey?: string;
  timestamps?: boolean;
  softDelete?: boolean;
}

export abstract class BaseRepository<T extends Record<string, unknown>> implements Repository<T> {
  protected readonly logger = Logger.getInstance();
  protected readonly config: RepositoryConfig;
  protected readonly connection: DatabaseConnection;

  constructor(connection: DatabaseConnection, config: RepositoryConfig) {
    this.connection = connection;
    this.config = {
      primaryKey: "id",
      timestamps: true,
      softDelete: false,
      ...config,
    };
  }

  /**
   * Get all records from the table
   */
  async findAll(): Promise<T[]> {
    try {
      const sql = this.buildSelectSql();
      this.logger.debug(`Executing findAll query: ${sql}`, LoggingTags.DATABASE);

      const results = await this.connection.query<T>(sql);
      return this.transformResults(results);
    } catch (error) {
      this.handleDatabaseError(error, "findAll", {});
      throw error;
    }
  }

  /**
   * Get paginated records from the table
   */
  async findAllPaginated(page: number, limit: number): Promise<{ items: T[]; total: number }> {
    if (page < 1 || limit < 1) {
      throw new ValidationError({
        message: "Page and limit must be positive numbers",
        context: { page, limit },
      });
    }

    try {
      // Get total count
      const countSql = this.buildCountSql();
      this.logger.debug(`Executing count query: ${countSql}`, LoggingTags.DATABASE);

      const countResult = await this.connection.queryOne<{ total: number }>(countSql);
      const total = countResult?.total || 0;

      // Get paginated items
      const offset = (page - 1) * limit;
      const sql = this.buildSelectSql() + ` LIMIT ${limit} OFFSET ${offset}`;
      this.logger.debug(`Executing paginated query: ${sql}`, LoggingTags.DATABASE);

      const results = await this.connection.query<T>(sql);
      const items = this.transformResults(results);

      return { items, total };
    } catch (error) {
      this.handleDatabaseError(error, "findAllPaginated", { page, limit });
      throw error;
    }
  }

  /**
   * Find a record by its primary key
   */
  async findById(id: string | number): Promise<T | null> {
    try {
      const sql = this.buildSelectSql() + ` WHERE ${this.config.primaryKey} = ?`;
      this.logger.debug(`Executing findById query: ${sql}`, LoggingTags.DATABASE);

      const result = await this.connection.queryOne<T>(sql, [id]);
      return result ? this.transformResult(result) : null;
    } catch (error) {
      this.handleDatabaseError(error, "findById", { id });
      throw error;
    }
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      const insertData = this.prepareInsertData(data);
      const { sql, values } = this.buildInsertSql(insertData);

      this.logger.debug(`Executing create query: ${sql}`, LoggingTags.DATABASE);

      const result = await this.connection.execute(sql, values);

      // For auto-increment primary keys
      if (result.insertId) {
        const created = await this.findById(result.insertId);
        if (!created) {
          throw new DatabaseError({
            message: "Failed to retrieve created record",
            context: { insertId: result.insertId },
          });
        }
        return created;
      }

      // For non-auto-increment primary keys
      const primaryKeyValue = insertData[this.config.primaryKey!] as string | number;
      if (primaryKeyValue) {
        const created = await this.findById(primaryKeyValue);
        if (!created) {
          throw new DatabaseError({
            message: "Failed to retrieve created record",
            context: { primaryKey: primaryKeyValue },
          });
        }
        return created;
      }

      throw new DatabaseError({
        message: "Unable to determine primary key for created record",
      });
    } catch (error) {
      this.handleDatabaseError(error, "create", data);
      throw error;
    }
  }

  /**
   * Update a record by its primary key
   */
  async update(id: string | number, data: Partial<T>): Promise<T | null> {
    try {
      // Check if record exists
      const existing = await this.findById(id);
      if (!existing) {
        return null;
      }

      const updateData = this.prepareUpdateData(data);
      const { sql, values } = this.buildUpdateSql(updateData, id);

      this.logger.debug(`Executing update query: ${sql}`, LoggingTags.DATABASE);

      const result = await this.connection.execute(sql, values);

      if (result.affectedRows === 0) {
        return null;
      }

      return await this.findById(id);
    } catch (error) {
      this.handleDatabaseError(error, "update", { id, data });
      throw error;
    }
  }

  /**
   * Delete a record by its primary key (soft delete if configured)
   */
  async delete(id: string | number): Promise<boolean> {
    try {
      // Check if record exists
      const existing = await this.findById(id);
      if (!existing) {
        return false;
      }

      let sql: string;
      const params = [id];

      if (this.config.softDelete) {
        // Soft delete - update deleted_at timestamp
        sql = `UPDATE ${this.config.tableName} SET deleted_at = NOW() WHERE ${this.config.primaryKey} = ?`;
      } else {
        // Hard delete
        sql = `DELETE FROM ${this.config.tableName} WHERE ${this.config.primaryKey} = ?`;
      }

      this.logger.debug(`Executing delete query: ${sql}`, LoggingTags.DATABASE);

      const result = await this.connection.execute(sql, params);
      return result.affectedRows > 0;
    } catch (error) {
      this.handleDatabaseError(error, "delete", { id });
      throw error;
    }
  }

  /**
   * Execute a custom query
   */
  protected async query<R = T>(sql: string, params?: unknown[]): Promise<R[]> {
    try {
      this.logger.debug(`Executing custom query: ${sql}`, LoggingTags.DATABASE);
      return await this.connection.query<R>(sql, params);
    } catch (error) {
      this.handleDatabaseError(error, "query", { sql, params });
      throw error;
    }
  }

  /**
   * Execute a custom query that returns a single result
   */
  protected async queryOne<R = T>(sql: string, params?: unknown[]): Promise<R | null> {
    try {
      this.logger.debug(`Executing custom queryOne: ${sql}`, LoggingTags.DATABASE);
      return await this.connection.queryOne<R>(sql, params);
    } catch (error) {
      this.handleDatabaseError(error, "queryOne", { sql, params });
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  protected async transaction<R>(callback: (connection: DatabaseConnection) => Promise<R>): Promise<R> {
    try {
      this.logger.debug("Starting transaction", LoggingTags.DATABASE);
      return await this.connection.transaction(callback);
    } catch (error) {
      this.handleDatabaseError(error, "transaction", {});
      throw error;
    }
  }

  /**
   * Build SELECT SQL query
   */
  protected buildSelectSql(): string {
    let sql = `SELECT * FROM ${this.config.tableName}`;

    if (this.config.softDelete) {
      sql += " WHERE deleted_at IS NULL";
    }

    return sql;
  }

  /**
   * Build COUNT SQL query
   */
  protected buildCountSql(): string {
    let sql = `SELECT COUNT(*) as total FROM ${this.config.tableName}`;

    if (this.config.softDelete) {
      sql += " WHERE deleted_at IS NULL";
    }

    return sql;
  }

  /**
   * Build INSERT SQL query
   */
  protected buildInsertSql(data: Record<string, unknown>): { sql: string; values: unknown[] } {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(", ");

    const sql = `INSERT INTO ${this.config.tableName} (${keys.join(", ")}) VALUES (${placeholders})`;
    const values = Object.values(data);

    return { sql, values };
  }

  /**
   * Build UPDATE SQL query
   */
  protected buildUpdateSql(data: Record<string, unknown>, id: string | number): { sql: string; values: unknown[] } {
    const keys = Object.keys(data);
    const setClause = keys.map((key) => `${key} = ?`).join(", ");

    const sql = `UPDATE ${this.config.tableName} SET ${setClause} WHERE ${this.config.primaryKey} = ?`;
    const values = [...Object.values(data), id];

    return { sql, values };
  }

  /**
   * Prepare data for insert (add timestamps if configured)
   */
  protected prepareInsertData(data: Partial<T>): Record<string, unknown> {
    const insertData: Record<string, unknown> = { ...data };

    if (this.config.timestamps) {
      insertData.created_at = new Date();
      insertData.updated_at = new Date();
    }

    return insertData;
  }

  /**
   * Prepare data for update (add updated timestamp if configured)
   */
  protected prepareUpdateData(data: Partial<T>): Record<string, unknown> {
    const updateData: Record<string, unknown> = { ...data };

    if (this.config.timestamps) {
      updateData.updated_at = new Date();
    }

    return updateData;
  }

  /**
   * Transform database result (override in subclasses for custom transformations)
   */
  protected transformResult(result: T): T {
    return result;
  }

  /**
   * Transform multiple database results
   */
  protected transformResults(results: T[]): T[] {
    return results.map((result) => this.transformResult(result));
  }

  /**
   * Handle database errors with proper logging and error transformation
   */
  protected handleDatabaseError(error: unknown, operation: string, context: Record<string, unknown>): void {
    const errorMessage = error instanceof Error ? error.message : "Unknown database error";

    this.logger.error(`Database error in ${operation}: ${errorMessage}. Context: ${JSON.stringify(context)}`, this.constructor.name, LoggingTags.DATABASE);

    // You can add specific database error handling here
    // For example, transform constraint violations to ValidationError
    if (errorMessage.includes("UNIQUE constraint") || errorMessage.includes("Duplicate entry")) {
      throw new ValidationError({
        message: "Record with this value already exists",
        errorCode: ErrorCode.RESOURCE_ALREADY_EXISTS,
        context,
      });
    }

    if (errorMessage.includes("NOT NULL constraint") || errorMessage.includes("cannot be null")) {
      throw new ValidationError({
        message: "Required field is missing",
        errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
        context,
      });
    }
  }
}
