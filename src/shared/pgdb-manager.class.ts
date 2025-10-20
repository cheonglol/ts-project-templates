/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import dotenv from "dotenv";
import postgres from "postgres";
import { EnvVarKeys } from "./env-validation.module";
import logger from "./logging";
import LoggingTags from "../data/enums/logging-tags.enum";

dotenv.config();

class PostgresDatabaseManager {
  private psql: postgres.Sql<{}> | null = null;
  private initializing: Promise<void> | null = null;
  private readonly connectionString: string;
  // Default retry config for startup (use EnvVarKeys to read env)
  private readonly startupRetries = Number(process.env[EnvVarKeys.STARTUP_DB_RETRIES] ?? 5);
  private readonly startupBackoffMs = Number(process.env[EnvVarKeys.STARTUP_DB_BACKOFF_MS] ?? 500);

  constructor() {
    const PSQL_CONNECTION_STRING = process.env[EnvVarKeys.PSQL_CONNECTION_STRING];
    if (!PSQL_CONNECTION_STRING) {
      const errorMessage = `${EnvVarKeys.PSQL_CONNECTION_STRING} must be defined`;
      logger.error(errorMessage, "constructor", LoggingTags.ERROR);
      throw new Error(errorMessage);
    }
    this.connectionString = PSQL_CONNECTION_STRING;
  }

  public async initialize(): Promise<void> {
    if (this.psql) {
      logger.debug("Database already initialized", this.initialize.name, LoggingTags.DATABASE);
      return;
    }
    if (this.initializing) {
      logger.debug("Database initialization already in progress, waiting", this.initialize.name, LoggingTags.DATABASE);
      return this.initializing;
    }
    this.initializing = (async () => {
      try {
        // Create the pool and run connectivity + migrations with retry/backoff
        await this.retry(
          async () => {
            // create pool
            if (!this.psql) {
              this.psql = postgres(this.connectionString, {
                ssl: false,
                max: 10,
                // disable preparing statements by name on the server
                prepare: false,
              });
              logger.info("Database connection pool initialized", this.initialize.name, LoggingTags.DATABASE);
            }

            // test and migrate
            await this.testConnection();
            await this.applyMigrations();
          },
          this.startupRetries,
          this.startupBackoffMs
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to initialize database connection: ${errorMessage}`, this.initialize.name, LoggingTags.DATABASE);
        // Ensure we don't keep a partially-initialized client around
        try {
          if (this.psql) await this.psql.end();
        } catch (closeErr) {
          logger.error(`Error closing partially-initialized pool: ${closeErr instanceof Error ? closeErr.stack : String(closeErr)}`, this.initialize.name, LoggingTags.DATABASE);
        } finally {
          this.psql = null;
        }

        throw new Error(`Failed to initialize database connection: ${errorMessage}`);
      } finally {
        // allow future attempts if initialization failed or to re-check state
        this.initializing = null;
      }
    })();

    return this.initializing;
  }

  /**
   * Small retry helper with exponential backoff.
   * Keeps the function flat and readable.
   */
  private async retry<T>(fn: () => Promise<T>, attempts: number, baseDelayMs: number): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const wait = baseDelayMs * Math.pow(2, i);
        logger.warn(`Operation failed, attempt ${i + 1}/${attempts}. Retrying in ${wait}ms...`, this.retry.name, LoggingTags.DATABASE);
        // wait
        await new Promise((res) => setTimeout(res, wait));
      }
    }
    throw lastErr;
  }

  public async testConnection(): Promise<void> {
    if (!this.psql) throw new Error("Database connection not initialized");
    try {
      const result = await this.psql`SELECT 1 AS test;`;
      logger.info("Database connection successful", this.testConnection.name, LoggingTags.DATABASE);
      logger.debug(result, this.testConnection.name, LoggingTags.DATABASE);
    } catch (error) {
      logger.error("Error connecting to the database", this.testConnection.name, LoggingTags.DATABASE);
      logger.error(error instanceof Error ? error.stack : String(error), this.testConnection.name, LoggingTags.DATABASE);
      // Do not exit the process here; throw and let the caller decide how to handle shutdown.
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async close(): Promise<void> {
    // If initialization is in progress, wait a short time for it to finish.
    if (this.initializing) {
      try {
        // Wait up to 5 seconds for initialization to complete
        await Promise.race([this.initializing, new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for initialization to finish")), 5000))]);
      } catch (err) {
        // Continue with close attempt even if initialization timed out or failed
        logger.warn(`Waiting for initialization before close failed: ${err}`, this.close.name, LoggingTags.DATABASE);
      }
    }

    if (!this.psql) return;

    try {
      await this.psql.end();
      this.psql = null;
      logger.info("Database connection pool closed", this.close.name, LoggingTags.DATABASE);
    } catch (error) {
      logger.error("Error closing database connection", this.close.name, LoggingTags.DATABASE);
      logger.error(error, this.close.name, LoggingTags.DATABASE);
    }
  }

  private async applyMigrations(): Promise<void> {
    if (!this.psql) throw new Error("Database connection not initialized");
    try {
      const fs = await import("fs");
      const path = await import("path");
      const crypto = await import("crypto");

      const migrationsDir = path.resolve(__dirname, "../database/migrations");

      // Ensure migrations directory exists
      if (!fs.existsSync(migrationsDir)) {
        logger.info("Migrations directory not found, skipping migrations", this.applyMigrations.name, LoggingTags.DATABASE);
        return;
      }

      // Get all migration files
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort(); // Important: apply in alphabetical order
      if (migrationFiles.length === 0) {
        logger.info("No migration files found, skipping migrations", this.applyMigrations.name, LoggingTags.DATABASE);
        return;
      }

      logger.info(`Found ${migrationFiles.length} migration files`, this.applyMigrations.name, LoggingTags.DATABASE);

      // First, ensure migrations table exists (run first migration separately)
      const firstMigration = migrationFiles[0];
      if (firstMigration === "001_create_migrations_table.sql") {
        const migrationPath = path.join(migrationsDir, firstMigration);
        const sql = fs.readFileSync(migrationPath, { encoding: "utf8" });
        await this.psql.begin(async (tx: any) => await tx.unsafe(sql));
        logger.info(`Applied migration: ${firstMigration}`, this.applyMigrations.name, LoggingTags.DATABASE);
      }

      // Get already applied migrations
      const appliedMigrations = await this.psql`
        SELECT filename FROM migrations ORDER BY filename
      `;
      const appliedFilenames = new Set(appliedMigrations.map((row) => row.filename));

      // Apply pending migrations
      for (const filename of migrationFiles) {
        if (appliedFilenames.has(filename)) {
          logger.debug(`Migration already applied: ${filename}`, this.applyMigrations.name, LoggingTags.DATABASE);
          continue;
        }

        const migrationPath = path.join(migrationsDir, filename);
        const sql = fs.readFileSync(migrationPath, { encoding: "utf8" });
        const checksum = crypto.createHash("sha256").update(sql).digest("hex");

        await this.psql.begin(async (tx: any) => {
          await tx.unsafe(sql); // Apply migration
          await tx`
            INSERT INTO migrations (filename, checksum) 
            VALUES (${filename}, ${checksum})
          `; // Record migration
        });
        logger.info(`Applied migration: ${filename}`, this.applyMigrations.name, LoggingTags.DATABASE);
      }
      logger.info("All migrations applied successfully", this.applyMigrations.name, LoggingTags.DATABASE);
    } catch (error) {
      logger.error(`Migration error: ${error instanceof Error ? error.stack : String(error)}`, this.applyMigrations.name, LoggingTags.DATABASE);
      throw error;
    }
  }

  // Removed duplicate closeConnection() — use public close() instead.

  public static async closeAll(): Promise<void> {
    await DBConnection.close();
  }

  public getConnection(): postgres.Sql<{}> {
    if (!this.psql) {
      throw new Error("Database connection not initialized. Call initialize() first.");
    }
    return this.psql;
  }

  /**
   * Returns true when the connection pool has been initialized and is available.
   */
  public isInitialized(): boolean {
    return this.psql !== null;
  }
  public getStatus(): "uninitialized" | "initializing" | "initialized" {
    if (this.psql) return "initialized";
    if (this.initializing) return "initializing";
    return "uninitialized";
  }
}

// Create singleton instance
const DBConnection = new PostgresDatabaseManager();

// Note: Database initialization is now handled explicitly in index.ts startup sequence
// This ensures proper error handling and startup order control

export default DBConnection;
