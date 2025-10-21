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
  private connectionString: string;
  // Use env var names defined in shared/env-validation.module.ts
  private readonly startupRetries = Number(process.env[EnvVarKeys.PSQL_STARTUP_RETRIES] ?? 5);
  private readonly startupBackoffMs = Number(process.env[EnvVarKeys.PSQL_STARTUP_BACKOFF_MS] ?? 500);
  private readonly initTimeoutMs = Number(process.env[EnvVarKeys.PSQL_INIT_TIMEOUT_MS] ?? 0);

  constructor() {
    const PSQL_CONNECTION_STRING = process.env[EnvVarKeys.PSQL_CONNECTION_STRING];
    if (!PSQL_CONNECTION_STRING) {
      const errorMessage = `${EnvVarKeys.PSQL_CONNECTION_STRING} must be defined`;
      logger.error(errorMessage, "constructor", LoggingTags.ERROR);
      throw new Error(errorMessage);
    }
    this.connectionString = PSQL_CONNECTION_STRING;
  }

  /**
   * Mask password in a Postgres connection string for safe logging.
   * e.g. postgres://user:secret@host/db -> postgres://user:****@host/db
   */
  private maskConnectionString(conn: string): string {
    try {
      // rough parse for postgres://user:pass@host[:port]/db
      return conn.replace(/(:\/\/[^:/]+:)([^@]+)(@)/, (_m, p1, _p2, p3) => `${p1}****${p3}`);
    } catch {
      return "[masked]";
    }
  }

  public async initialize(): Promise<void> {
    // If an initialization is already in progress, wait for it first. This avoids a race where
    // `knexInstance` was created but migrations or other init steps are still running.
    if (this.initializing) {
      logger.debug("Database initialization already in progress, waiting", this.initialize.name, LoggingTags.DATABASE);
      return this.initializing;
    }
    if (this.knexInstance) return logger.debug("Database already initialized", this.initialize.name, LoggingTags.DATABASE);

    this.initializing = (async () => {
      try {
        const initPromise = this.retry(
          async () => {
            // Build SSL options if requested
            let sslOption: Record<string, unknown> | undefined;
            try {
              const psqlSsl = process.env[EnvVarKeys.PSQL_SSL];
              if (psqlSsl && String(psqlSsl).toLowerCase() === "true") {
                const rejectUnauthorizedRaw = process.env[EnvVarKeys.PSQL_SSL_REJECT_UNAUTHORIZED];
                const caPath = process.env[EnvVarKeys.PSQL_SSL_CA];

                const rejectUnauthorized = rejectUnauthorizedRaw === undefined ? true : String(rejectUnauthorizedRaw).toLowerCase() !== "false";
                sslOption = { rejectUnauthorized } as Record<string, unknown>;

                if (caPath) {
                  try {
                    // read synchronously during init (small file expected)
                    const fs = await import("fs");
                    const ca = fs.readFileSync(String(caPath), "utf8");
                    sslOption.ca = ca;
                  } catch (caErr) {
                    const msg = `Failed to read PSQL_SSL_CA file at ${caPath}: ${caErr instanceof Error ? caErr.message : String(caErr)}`;
                    logger.error(msg, this.initialize.name, LoggingTags.DATABASE);
                    throw new Error(msg);
                  }
                }
              }
            } catch (sslErr) {
              // Bubble up SSL parsing errors to fail initialization clearly
              const msg = `Invalid PSQL SSL configuration: ${sslErr instanceof Error ? sslErr.message : String(sslErr)}`;
              logger.error(msg, this.initialize.name, LoggingTags.DATABASE);
              throw new Error(msg);
            }
            if (!this.knexInstance) {
              // If sslOption is present we need to pass a connection object; otherwise the connection string is fine.
              const connectionConfig = sslOption ? { connectionString: this.connectionString, ssl: sslOption } : this.connectionString;

              // Allow pool tuning via env vars (PSQL_POOL_MIN / PSQL_POOL_MAX), falling back to safe defaults.
              const poolMin = Number(process.env[EnvVarKeys.PSQL_POOL_MIN] ?? 2);
              const poolMax = Number(process.env[EnvVarKeys.PSQL_POOL_MAX] ?? 10);

              this.knexInstance = knex({
                client: "pg",
                connection: connectionConfig as unknown as string | Record<string, unknown>,
                pool: { min: poolMin, max: poolMax },
              });
              logger.info("Knex DB client initialized", this.initialize.name, LoggingTags.DATABASE);
            }

            await this.testConnection();
            await this.applyMigrations();
          },
          this.startupRetries,
          this.startupBackoffMs
        );

        if (this.initTimeoutMs > 0) {
          await Promise.race([
            initPromise,
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`Database initialization timed out after ${this.initTimeoutMs}ms`)), this.initTimeoutMs)),
          ]);
        } else {
          await initPromise;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const maskedConn = this.maskConnectionString(this.connectionString);
        logger.error(`Failed to initialize database connection (connection=${maskedConn}): ${errorMessage}`, this.initialize.name, LoggingTags.DATABASE);
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
        const waitMs = Number(process.env[EnvVarKeys.PSQL_CLOSE_TIMEOUT_MS] ?? 5000);
        await Promise.race([this.initializing, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Timeout waiting for initialization to finish")), waitMs))]);
      } catch (err) {
        logger.warn(`Waiting for initialization before close failed: ${err}`, this.close.name, LoggingTags.DATABASE);
      }
    }

    if (!this.knexInstance) return;

    try {
      const destroyPromise = this.knexInstance.destroy();
      const closeTimeoutMs = Number(process.env[EnvVarKeys.PSQL_CLOSE_TIMEOUT_MS] ?? 5000);
      await Promise.race([destroyPromise, new Promise((_res, rej) => setTimeout(() => rej(new Error("Timeout during knex.destroy()")), closeTimeoutMs))]);
      this.knexInstance = null;
      logger.info("Database client destroyed", this.close.name, LoggingTags.DATABASE);
    } catch (error) {
      logger.error("Error destroying database client", this.close.name, LoggingTags.DATABASE);
      logger.error(error, this.close.name, LoggingTags.DATABASE);
    }
  }

  /**
   * Refresh the Knex connection pool. Optionally provide a new connection string.
   * This is useful when credentials rotate or the connection string changes.
   */
  public async refreshConnection(newConnectionString?: string): Promise<void> {
    // If a new connection string is provided, update it
    if (newConnectionString) this.connectionString = newConnectionString;

    // If initialization already in progress, wait for it to finish
    if (this.initializing) await this.initializing;

    // Destroy existing instance if present
    if (this.knexInstance) {
      try {
        await this.knexInstance.destroy();
      } catch (err) {
        logger.warn(`Error destroying existing knex instance during refresh: ${err}`, this.refreshConnection.name, LoggingTags.DATABASE);
      } finally {
        this.knexInstance = null;
      }
    }

    // Re-run initialize to recreate pool and re-run migrations if needed
    await this.initialize();
  }

  private async applyMigrations(): Promise<void> {
    if (!this.knexInstance) throw new Error("Database connection not initialized");

    // Programmatic SQL-runner using Knex connection: advisory lock + checksum + transactional apply
    try {
      const fs = await import("fs");
      const crypto = await import("crypto");

      // Prefer Knex migrations. If a knex_migrations directory exists, run knex.migrate.latest()
      const knexMigrationsDir = path.resolve(__dirname, "../database/knex_migrations");
      if (fs.existsSync(knexMigrationsDir) && typeof (this.knexInstance as any).migrate?.latest === "function") {
        logger.info("Found knex_migrations directory; running knex.migrate.latest()", this.applyMigrations.name, LoggingTags.DATABASE);
        try {
          await (this.knexInstance as any).migrate.latest({ directory: knexMigrationsDir });
          logger.info("Knex migrations applied successfully", this.applyMigrations.name, LoggingTags.DATABASE);
        } catch (migrErr) {
          logger.error(`Knex migration error: ${migrErr instanceof Error ? migrErr.stack : String(migrErr)}`, this.applyMigrations.name, LoggingTags.DATABASE);
          throw migrErr;
        }
      } else {
        logger.info("No knex_migrations directory found; skipping migrations", this.applyMigrations.name, LoggingTags.DATABASE);
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

  /**
   * Return a ready Knex instance, waiting for an in-progress initialization if necessary.
   * If initialization does not complete within `timeoutMs`, rejects with an error.
   */
  public async getOrWaitConnection(timeoutMs = 5000): Promise<Knex> {
    if (this.knexInstance) return this.knexInstance;

    if (this.initializing) {
      // Wait for initialization to complete or timeout
      await Promise.race([this.initializing, new Promise((_res, rej) => setTimeout(() => rej(new Error(`Timed out waiting ${timeoutMs}ms for DB initialization`)), timeoutMs))]);

      if (this.knexInstance) return this.knexInstance;
      throw new Error("Database initialization completed but client is not available");
    }

    throw new Error("Database not initialized. Call initialize() first.");
  }

  /**
   * Run a lightweight DB health check. Returns { ok, latencyMs?, error? }.
   * If timeoutMs > 0, will fail if the check doesn't complete in time.
   */
  public async checkHealth(timeoutMs = 2000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    if (!this.knexInstance) return { ok: false, error: "not-initialized" };

    const start = Date.now();
    try {
      const rawPromise = this.knexInstance.raw("SELECT 1 AS test;");
      if (timeoutMs > 0) {
        await Promise.race([rawPromise, new Promise((_res, rej) => setTimeout(() => rej(new Error("healthcheck timeout")), timeoutMs))]);
      } else {
        await rawPromise;
      }

      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
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
