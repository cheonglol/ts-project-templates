import { FastifyRequest, FastifyReply } from "fastify";
import { BaseController } from "../base/base-controller.class";
import DBConnection from "../../database/pgdb-manager.class";
import logger from "../../shared/logging";
import LoggingTags from "../../data/enums/logging-tags.enum";

export class HealthCheckController extends BaseController {
  async checkHealth(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.sendSuccess(reply, "Service is healthy", {
      status: "UP",
    });
  }

  async getDetailedHealth(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Collect system metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Check database connectivity
    let databaseStatus = "DOWN";
    let databaseError: string | null = null;

    try {
      const result = await DBConnection.checkHealth(2000);
      if (result.ok) {
        databaseStatus = "UP";
      } else {
        databaseError = result.error ?? "unknown";
      }
    } catch (error) {
      databaseError = error instanceof Error ? error.message : "Unknown database error";
      logger.warn(`Database health check failed: ${databaseError}`, "getDetailedHealth", LoggingTags.DATABASE);
    }

    const healthData = {
      status: databaseStatus === "UP" ? "UP" : "DEGRADED",
      uptime: `${uptime.toFixed(2)} seconds`,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      },
      database: {
        status: databaseStatus,
        ...(databaseError && { error: databaseError }),
      },
    };

    if (databaseStatus === "UP") {
      this.sendSuccess(reply, "Health check details", healthData);
    } else {
      reply.status(503);
      this.sendError(reply, "Service degraded - database connectivity issues", healthData);
    }
  }

  async checkDatabase(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const startTime = Date.now();
      const conn = DBConnection.getConnection();
      // Test basic connectivity
      await conn.raw("SELECT 1 AS test");

      // Test migrations table: prefer Knex's default table 'knex_migrations', fallback to legacy 'migrations'
      let appliedCount = 0;
      const extractCount = (rows: unknown): number => {
        if (!rows) return 0;
        if (Array.isArray(rows) && rows.length > 0) {
          const first = rows[0] as unknown;
          if (typeof first === "object" && first !== null) {
            const obj = first as Record<string, unknown>;
            const val = obj.count ?? obj.COUNT ?? obj.total ?? obj.TOTAL;
            if (typeof val === "number") return val;
            if (typeof val === "string") return parseInt(val, 10) || 0;
          }
        }
        return 0;
      };

      try {
        const rows = await conn("knex_migrations").count("* as count");
        appliedCount = extractCount(rows);
      } catch {
        try {
          const rows = await conn("migrations").count("* as count");
          appliedCount = extractCount(rows);
        } catch {
          appliedCount = 0;
        }
      }

      const responseTime = Date.now() - startTime;

      this.sendSuccess(reply, "Database connectivity check passed", {
        status: "UP",
        responseTime: `${responseTime}ms`,
        migrations: {
          applied: appliedCount,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown database error";
      logger.error(`Database health check failed: ${errorMessage}`, "checkDatabase", LoggingTags.DATABASE);

      reply.status(503);
      this.sendError(reply, "Database connectivity check failed", {
        status: "DOWN",
        error: errorMessage,
      });
    }
  }
}
