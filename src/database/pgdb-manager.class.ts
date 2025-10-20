import dotenv from "dotenv";
import { knex, type Knex } from "knex";
import path from "path";
import { EnvVarKeys } from "../shared/env-validation.module";
import logger from "../shared/logging";
import LoggingTags from "../data/enums/logging-tags.enum";

dotenv.config();

class PostgresDatabaseManager {
  private knexInstance: Knex | null = null;
  private initializing: Promise<void> | null = null;
  private readonly connectionString: string;
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
    if (this.knexInstance) {
      logger.debug("Database already initialized", this.initialize.name, LoggingTags.DATABASE);
      return;
    }
    if (this.initializing) {
      logger.debug("Database initialization already in progress, waiting", this.initialize.name, LoggingTags.DATABASE);
      return this.initializing;
    }

    this.initializing = (async () => {
      try {
        await this.retry(
          async () => {
            if (!this.knexInstance) {
              this.knexInstance = knex({
                client: "pg",
                connection: this.connectionString,
                pool: { min: 2, max: 10 },
              });
              logger.info("Knex DB client initialized", this.initialize.name, LoggingTags.DATABASE);
            }

            await this.testConnection();
            await this.applyMigrations();
          },
          this.startupRetries,
          this.startupBackoffMs
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to initialize database connection: ${errorMessage}`, this.initialize.name, LoggingTags.DATABASE);
        try {
          if (this.knexInstance) await this.knexInstance.destroy();
        } catch (closeErr) {
          logger.error(
            `Error destroying partially-initialized knex client: ${closeErr instanceof Error ? closeErr.stack : String(closeErr)}`,
            this.initialize.name,
            LoggingTags.DATABASE
          );
        } finally {
          this.knexInstance = null;
        }

        throw new Error(`Failed to initialize database connection: ${errorMessage}`);
      } finally {
        this.initializing = null;
      }
    })();

    return this.initializing;
  }

  private async retry<T>(fn: () => Promise<T>, attempts: number, baseDelayMs: number): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const wait = baseDelayMs * Math.pow(2, i);
        logger.warn(`Operation failed, attempt ${i + 1}/${attempts}. Retrying in ${wait}ms...`, this.retry.name, LoggingTags.DATABASE);
        await new Promise((res) => setTimeout(res, wait));
      }
    }
    throw lastErr;
  }

  public async testConnection(): Promise<void> {
    if (!this.knexInstance) throw new Error("Database connection not initialized");
    try {
      // Note: knex.raw returns different shapes depending on driver; use a tolerant check
      const res = await this.knexInstance.raw("SELECT 1 AS test;");
      logger.info("Database connection successful", this.testConnection.name, LoggingTags.DATABASE);
      logger.debug(res, this.testConnection.name, LoggingTags.DATABASE);
    } catch (error) {
      logger.error("Error connecting to the database", this.testConnection.name, LoggingTags.DATABASE);
      logger.error(error instanceof Error ? error.stack : String(error), this.testConnection.name, LoggingTags.DATABASE);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async close(): Promise<void> {
    if (this.initializing) {
      try {
        await Promise.race([this.initializing, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Timeout waiting for initialization to finish")), 5000))]);
      } catch (err) {
        logger.warn(`Waiting for initialization before close failed: ${err}`, this.close.name, LoggingTags.DATABASE);
      }
    }

    if (!this.knexInstance) return;

    try {
      await this.knexInstance.destroy();
      this.knexInstance = null;
      logger.info("Database client destroyed", this.close.name, LoggingTags.DATABASE);
    } catch (error) {
      logger.error("Error destroying database client", this.close.name, LoggingTags.DATABASE);
      logger.error(error, this.close.name, LoggingTags.DATABASE);
    }
  }

  private async applyMigrations(): Promise<void> {
    if (!this.knexInstance) throw new Error("Database connection not initialized");

    // Programmatic SQL-runner using Knex connection: advisory lock + checksum + transactional apply
    try {
      const fs = await import("fs");
      const crypto = await import("crypto");

      const migrationsDir = path.resolve(__dirname, "../database/migrations");

      if (!fs.existsSync(migrationsDir)) {
        logger.info("SQL migrations directory not found, skipping migrations", this.applyMigrations.name, LoggingTags.DATABASE);
        return;
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      if (files.length === 0) {
        logger.info("No SQL migration files found, skipping", this.applyMigrations.name, LoggingTags.DATABASE);
        return;
      }

      logger.info(`Found ${files.length} SQL migration files`, this.applyMigrations.name, LoggingTags.DATABASE);

      const knex = this.knexInstance;

      // Acquire advisory lock to avoid concurrent migration runs. Use a stable bigint key.
      // We'll use a single 64-bit key by passing two 32-bit ints: high and low. Pick constants.
      const LOCK_KEY_HIGH = 0x0f0f0f0f;
      const LOCK_KEY_LOW = 0x00f00f00;

      // pg returns rows in .rows for node-postgres. knex.raw() shape varies, so normalize.
      const tryLockRes = await knex.raw("SELECT pg_try_advisory_lock(?, ?) as locked", [LOCK_KEY_HIGH, LOCK_KEY_LOW]);
      const locked = tryLockRes && (tryLockRes.rows?.[0]?.locked ?? tryLockRes[0]?.locked ?? false);
      if (!locked) {
        logger.info("Another migration runner holds the advisory lock; skipping migrations", this.applyMigrations.name, LoggingTags.DATABASE);
        return;
      }

      try {
        // Ensure migrations table exists (idempotent)
        await knex.raw(`
          CREATE TABLE IF NOT EXISTS migrations (
            filename text PRIMARY KEY,
            checksum text NOT NULL,
            applied_at timestamptz DEFAULT now()
          );
        `);

        // Load applied migrations
        const appliedRowsRaw = await knex("migrations").select("filename", "checksum");
        const appliedMap = new Map<string, string>();
        for (const r of appliedRowsRaw) appliedMap.set(r.filename, r.checksum);

        for (const filename of files) {
          if (appliedMap.has(filename)) {
            logger.debug(`Migration already applied: ${filename}`, this.applyMigrations.name, LoggingTags.DATABASE);
            continue;
          }

          const fullpath = path.join(migrationsDir, filename);
          const sql = fs.readFileSync(fullpath, { encoding: "utf8" });
          const checksum = crypto.createHash("sha256").update(sql).digest("hex");

          // Apply migration in a transaction so recording is atomic with execution when possible
          await knex.transaction(async (trx) => {
            // Execute SQL. Some SQL files may contain multiple statements.
            await trx.raw(sql);
            await trx("migrations").insert({ filename, checksum });
          });

          logger.info(`Applied SQL migration: ${filename}`, this.applyMigrations.name, LoggingTags.DATABASE);
        }

        logger.info("SQL migrations applied successfully", this.applyMigrations.name, LoggingTags.DATABASE);
      } finally {
        // Release advisory lock
        try {
          await knex.raw("SELECT pg_advisory_unlock(?, ?)", [LOCK_KEY_HIGH, LOCK_KEY_LOW]);
        } catch (unlockErr) {
          logger.warn(`Failed to release advisory lock: ${unlockErr}`, this.applyMigrations.name, LoggingTags.DATABASE);
        }
      }
    } catch (error) {
      logger.error(`Migration error: ${error instanceof Error ? error.stack : String(error)}`, this.applyMigrations.name, LoggingTags.DATABASE);
      throw error;
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    if (!this.knexInstance) throw new Error("Database connection not initialized");
    await this.knexInstance!.raw(`
      CREATE TABLE IF NOT EXISTS migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz DEFAULT now()
      );
    `);
    logger.info("Ensured migrations table exists", this.ensureMigrationsTable.name, LoggingTags.DATABASE);
  }

  public static async closeAll(): Promise<void> {
    await DBConnection.close();
  }

  public getConnection(): Knex {
    if (!this.knexInstance) throw new Error("Database connection not initialized. Call initialize() first.");
    return this.knexInstance;
  }

  public isInitialized(): boolean {
    return this.knexInstance !== null;
  }

  public getStatus(): "uninitialized" | "initializing" | "initialized" {
    if (this.knexInstance) return "initialized";
    if (this.initializing) return "initializing";
    return "uninitialized";
  }
}

const DBConnection = new PostgresDatabaseManager();

export default DBConnection;
