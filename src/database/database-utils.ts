/**
 * Database Utilities
 *
 * Common database operations and utilities for the PostgreSQL database
 */

import DBConnection from "../shared/pgdb-manager.class";
import logger from "../shared/logging";
import LoggingTags from "../data/enums/logging-tags.enum";

export class DatabaseUtils {
  /**
   * Execute a SQL file from the sql directory
   */
  static async executeSqlFile(filename: string): Promise<void> {
    try {
      const fs = await import("fs");
      const path = await import("path");

      const sqlPath = path.resolve(__dirname, "sql", filename);

      if (!fs.existsSync(sqlPath)) {
        throw new Error(`SQL file not found: ${filename}`);
      }

      const sql = fs.readFileSync(sqlPath, { encoding: "utf8" });
      const connection = DBConnection.getConnection();

      await connection.begin(async (tx) => {
        await tx.unsafe(sql);
      });

      logger.info(`Successfully executed SQL file: ${filename}`, "DatabaseUtils.executeSqlFile", LoggingTags.DATABASE);
    } catch (error) {
      logger.error(`Failed to execute SQL file ${filename}: ${error}`, "DatabaseUtils.executeSqlFile", LoggingTags.DATABASE);
      throw error;
    }
  }

  /**
   * Check if a table exists in the database
   */
  static async tableExists(tableName: string): Promise<boolean> {
    try {
      const connection = DBConnection.getConnection();
      const result = await connection`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        ) as exists
      `;

      return result[0]?.exists || false;
    } catch (error) {
      logger.error(`Error checking if table exists: ${error}`, "DatabaseUtils.tableExists", LoggingTags.DATABASE);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  static async getMigrationStatus(): Promise<
    Array<{
      filename: string;
      applied_at: Date;
      checksum: string;
      applied_period: string;
    }>
  > {
    try {
      const connection = DBConnection.getConnection();

      // Check if migrations table exists first
      const tableExists = await this.tableExists("migrations");
      if (!tableExists) {
        return [];
      }

      const result = await connection`
        SELECT 
          filename,
          applied_at,
          checksum,
          CASE 
            WHEN applied_at > NOW() - INTERVAL '1 day' THEN 'recent'
            WHEN applied_at > NOW() - INTERVAL '1 week' THEN 'week'
            ELSE 'older'
          END as applied_period
        FROM migrations
        ORDER BY applied_at DESC
      `;

      return result as unknown as Array<{
        filename: string;
        applied_at: Date;
        checksum: string;
        applied_period: string;
      }>;
    } catch (error) {
      logger.error(`Error getting migration status: ${error}`, "DatabaseUtils.getMigrationStatus", LoggingTags.DATABASE);
      throw error;
    }
  }

  /**
   * Get database connection health
   */
  static async getConnectionHealth(): Promise<{
    connected: boolean;
    timestamp: Date;
    migrations_count: number;
    tables_count: number;
  }> {
    try {
      const connection = DBConnection.getConnection();

      // Test connection with a simple query
      await connection`SELECT 1`;

      // Get migrations count
      const migrationsCount = (await this.tableExists("migrations")) ? await connection`SELECT COUNT(*) as count FROM migrations` : [{ count: 0 }];

      // Get tables count
      const tablesCount = await connection`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;

      return {
        connected: true,
        timestamp: new Date(),
        migrations_count: Number(migrationsCount[0].count),
        tables_count: Number(tablesCount[0].count),
      };
    } catch (error) {
      logger.error(`Database health check failed: ${error}`, "DatabaseUtils.getConnectionHealth", LoggingTags.DATABASE);
      return {
        connected: false,
        timestamp: new Date(),
        migrations_count: 0,
        tables_count: 0,
      };
    }
  }

  /**
   * Reset database (WARNING: This will drop all tables!)
   */
  static async resetDatabase(): Promise<void> {
    try {
      const connection = DBConnection.getConnection();

      logger.warn("RESETTING DATABASE - ALL DATA WILL BE LOST!", "DatabaseUtils.resetDatabase", LoggingTags.DATABASE);

      await connection.begin(async (tx) => {
        // Drop all tables in public schema
        await tx`
          DROP SCHEMA public CASCADE;
          CREATE SCHEMA public;
          GRANT ALL ON SCHEMA public TO postgres;
          GRANT ALL ON SCHEMA public TO public;
        `;
      });

      logger.info("Database reset completed", "DatabaseUtils.resetDatabase", LoggingTags.DATABASE);
    } catch (error) {
      logger.error(`Database reset failed: ${error}`, "DatabaseUtils.resetDatabase", LoggingTags.DATABASE);
      throw error;
    }
  }

  /**
   * Backup table data to JSON
   */
  static async backupTable(tableName: string): Promise<unknown[]> {
    try {
      const connection = DBConnection.getConnection();

      const exists = await this.tableExists(tableName);
      if (!exists) {
        throw new Error(`Table ${tableName} does not exist`);
      }

      const result = await connection.unsafe(`SELECT * FROM ${tableName}`);

      logger.info(`Backed up ${result.length} rows from table: ${tableName}`, "DatabaseUtils.backupTable", LoggingTags.DATABASE);
      return result;
    } catch (error) {
      logger.error(`Failed to backup table ${tableName}: ${error}`, "DatabaseUtils.backupTable", LoggingTags.DATABASE);
      throw error;
    }
  }
}

export default DatabaseUtils;
