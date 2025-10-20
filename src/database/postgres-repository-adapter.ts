/**
 * PostgreSQL Repository Adapter (Knex-backed)
 *
 * This adapter exposes a minimal DatabaseConnection interface used by repositories.
 * It is intentionally thin: it delegates to a shared Knex instance from `pgdb-manager.class.ts`.
 *
 * Return shapes:
 * - query(): returns array of row objects
 * - queryOne(): returns single row or null
 * - execute(): returns { affectedRows, insertId? }
 */

import { type Knex } from "knex";
import { DatabaseConnection } from "../class/base/base-repository.class";
import DBConnection from "./pgdb-manager.class";
import logger from "../shared/logging";
import LoggingTags from "../data/enums/logging-tags.enum";

export class PostgresRepositoryAdapter implements DatabaseConnection {
  private knex: Knex;

  constructor() {
    this.knex = DBConnection.getConnection();
  }

  /**
   * Execute a query that returns multiple rows
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    try {
      logger.debug(`Executing query: ${sql}`, "PostgresAdapter.query", LoggingTags.DATABASE);

      const res = params && params.length > 0 ? await this.knex.raw(sql, params as unknown[]) : await this.knex.raw(sql);
      const rows = PostgresRepositoryAdapter.rowsFromRaw(res);
      return rows as unknown as T[];
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

      const res = params && params.length > 0 ? await this.knex.raw(sql, params as unknown[]) : await this.knex.raw(sql);
      const rows = PostgresRepositoryAdapter.rowsFromRaw(res);
      // affectedRows: prefer driver-provided count when possible
      let affectedRows = 0;
      const maybeRes = res as Record<string, unknown> | unknown[];
      if (maybeRes && typeof maybeRes === "object" && !Array.isArray(maybeRes) && "rowCount" in maybeRes) {
        const obj = maybeRes as { rowCount?: unknown };
        if (typeof obj.rowCount === "number") affectedRows = obj.rowCount as number;
      } else if (Array.isArray(rows)) affectedRows = rows.length;

      // For INSERT operations, try to get the inserted ID from RETURNING or first row
      let insertId: number | string | undefined;
      if (/^INSERT\s+/i.test(sql) && Array.isArray(rows) && rows.length > 0) {
        const firstRow = rows[0] as Record<string, unknown> | undefined;
        if (firstRow) {
          insertId = (firstRow.id ?? firstRow.inserted_id ?? firstRow.insertId) as number | string | undefined;
        }
      }

      return { affectedRows, insertId };
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

      const result = await this.knex.transaction(async (trx) => {
        const transactionAdapter = new PostgresTransactionAdapter(trx);
        const callbackResult = await callback(transactionAdapter);
        logger.debug("Transaction completed successfully", "PostgresAdapter.transaction", LoggingTags.DATABASE);
        return callbackResult as T;
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
  public static rowsFromRaw(res: unknown): unknown[] {
    if (!res) return [];
    // pg driver: res.rows
    if (typeof res === "object" && res !== null) {
      const maybe = res as { rows?: unknown[] };
      if (Array.isArray(maybe.rows)) return maybe.rows;
    }
    // mysql/mysql2 or some knex shapes: res[0] may be rows
    if (Array.isArray(res)) {
      if (Array.isArray(res[0])) return res[0] as unknown[];
      const first = res[0] as unknown;
      if (typeof first === "object" && first !== null) {
        const maybe = first as { rows?: unknown[] };
        if (Array.isArray(maybe.rows)) return maybe.rows;
      }
      return res as unknown[];
    }
    return [];
  }
}

/**
 * Transaction-scoped adapter for PostgreSQL
 */
class PostgresTransactionAdapter implements DatabaseConnection {
  constructor(private tx: Knex.Transaction) {}

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    try {
      const res = params && params.length > 0 ? await this.tx.raw(sql, params as unknown[]) : await this.tx.raw(sql);
      const rows = PostgresRepositoryAdapter.rowsFromRaw(res);
      return rows as unknown as T[];
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
      const res = params && params.length > 0 ? await this.tx.raw(sql, params as unknown[]) : await this.tx.raw(sql);
      const rows = PostgresRepositoryAdapter.rowsFromRaw(res);
      let affectedRows = 0;
      const maybeResTx = res as Record<string, unknown> | unknown[];
      if (maybeResTx && typeof maybeResTx === "object" && !Array.isArray(maybeResTx) && "rowCount" in maybeResTx) {
        const objTx = maybeResTx as { rowCount?: unknown };
        if (typeof objTx.rowCount === "number") affectedRows = objTx.rowCount as number;
      } else if (Array.isArray(rows)) affectedRows = rows.length;
      let insertId: number | string | undefined;
      if (/^INSERT\s+/i.test(sql) && Array.isArray(rows) && rows.length > 0) {
        const firstRow = rows[0] as Record<string, unknown> | undefined;
        if (firstRow) insertId = (firstRow.id ?? firstRow.inserted_id ?? firstRow.insertId) as number | string | undefined;
      }
      return { affectedRows, insertId };
    } catch (error) {
      logger.error(`Transaction execute failed: ${error}`, "PostgresTransactionAdapter.execute", LoggingTags.DATABASE);
      throw error;
    }
  }

  async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    // Nested transactions: use the same transaction context
    return await callback(this);
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
