/**
 * PostgreSQL Repository Adapter
 *
 * This adapter bridges the existing PostgreSQL connection module with the BaseRepository pattern.
 * It implements the DatabaseConnection interface using the postgres library.
 */

import postgres from "postgres";
import { DatabaseConnection } from "../class/base/base-repository.class";
import DBConnection from "./pgdb-manager.class";
import logger from "./logging";
import LoggingTags from "../data/enums/logging-tags.enum";

export class PostgresRepositoryAdapter implements DatabaseConnection {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  private psql: postgres.Sql<{}>;

  constructor() {
    this.psql = DBConnection.getConnection();
  }

  /**
   * Execute a query that returns multiple rows
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    try {
      logger.debug(`Executing query: ${sql}`, "PostgresAdapter.query", LoggingTags.DATABASE);

      let result;
      if (params && params.length > 0) {
        // Convert ? placeholders to $1, $2, etc. for PostgreSQL
        const pgSql = this.convertPlaceholders(sql);
        result = await this.psql.unsafe(pgSql, params as never[]);
      } else {
        result = await this.psql.unsafe(sql);
      }

      return result as unknown as T[];
    } catch (error) {
      logger.error(`Query execution failed: ${error}`, "PostgresAdapter.query", LoggingTags.DATABASE);
      throw error;
    }
  }

  /**
   * Execute a query that returns a single row
   */
  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute a command (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: number | string }> {
    try {
      logger.debug(`Executing command: ${sql}`, "PostgresAdapter.execute", LoggingTags.DATABASE);

      let result: unknown;
      if (params && params.length > 0) {
        const pgSql = this.convertPlaceholders(sql);
        result = await this.psql.unsafe(pgSql, params as never[]);
      } else {
        result = await this.psql.unsafe(sql);
      }

      // Handle different types of SQL commands
      const resultArray = result as unknown[];
      const affectedRows = Array.isArray(resultArray) ? resultArray.length : 0;

      // For INSERT operations, try to get the inserted ID
      let insertId: number | string | undefined;
      if (sql.trim().toUpperCase().startsWith("INSERT") && Array.isArray(resultArray) && resultArray.length > 0) {
        // If the result contains an ID field, use it
        const firstRow = resultArray[0] as Record<string, unknown>;
        insertId = firstRow.id as number | string;
      }

      return {
        affectedRows,
        insertId,
      };
    } catch (error) {
      logger.error(`Command execution failed: ${error}`, "PostgresAdapter.execute", LoggingTags.DATABASE);
      throw error;
    }
  }

  /**
   * Execute operations within a transaction
   */
  async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    try {
      logger.debug("Starting transaction", "PostgresAdapter.transaction", LoggingTags.DATABASE);

      const result = await this.psql.begin(async (tx) => {
        // Create a transaction-scoped adapter
        const transactionAdapter = new PostgresTransactionAdapter(tx);
        const callbackResult = await callback(transactionAdapter);

        logger.debug("Transaction completed successfully", "PostgresAdapter.transaction", LoggingTags.DATABASE);
        return callbackResult;
      });

      return result as T;
    } catch (error) {
      logger.error(`Transaction failed: ${error}`, "PostgresAdapter.transaction", LoggingTags.DATABASE);
      throw error;
    }
  }

  /**
   * Convert MySQL-style ? placeholders to PostgreSQL-style $1, $2, etc.
   */
  private convertPlaceholders(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }
}

/**
 * Transaction-scoped adapter for PostgreSQL
 */
class PostgresTransactionAdapter implements DatabaseConnection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private tx: any) {}

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    try {
      let result;
      if (params && params.length > 0) {
        const pgSql = this.convertPlaceholders(sql);
        result = await this.tx.unsafe(pgSql, params as never[]);
      } else {
        result = await this.tx.unsafe(sql);
      }

      return result as unknown as T[];
    } catch (error) {
      logger.error(`Transaction query failed: ${error}`, "PostgresTransactionAdapter.query", LoggingTags.DATABASE);
      throw error;
    }
  }

  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: number | string }> {
    try {
      let result: unknown;
      if (params && params.length > 0) {
        const pgSql = this.convertPlaceholders(sql);
        result = await this.tx.unsafe(pgSql, params as never[]);
      } else {
        result = await this.tx.unsafe(sql);
      }

      const resultArray = result as unknown[];
      const affectedRows = Array.isArray(resultArray) ? resultArray.length : 0;

      let insertId: number | string | undefined;
      if (sql.trim().toUpperCase().startsWith("INSERT") && Array.isArray(resultArray) && resultArray.length > 0) {
        const firstRow = resultArray[0] as Record<string, unknown>;
        insertId = firstRow.id as number | string;
      }

      return {
        affectedRows,
        insertId,
      };
    } catch (error) {
      logger.error(`Transaction execute failed: ${error}`, "PostgresTransactionAdapter.execute", LoggingTags.DATABASE);
      throw error;
    }
  }

  async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    // For nested transactions, just execute with the same transaction context
    return await callback(this);
  }

  private convertPlaceholders(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }
}

/**
 * Factory function to create a PostgreSQL repository adapter
 */
export function createPostgresAdapter(): PostgresRepositoryAdapter {
  return new PostgresRepositoryAdapter();
}

/**
 * Example usage:
 *
 * // Create adapter
 * const dbAdapter = createPostgresAdapter();
 *
 * // Create repository with the adapter
 * const userRepository = new UserRepository(dbAdapter);
 *
 * // Use repository
 * const users = await userRepository.findAll();
 */
