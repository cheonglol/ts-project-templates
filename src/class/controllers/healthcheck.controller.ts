import { FastifyRequest, FastifyReply } from "fastify";
import { BaseController } from "../base/base-controller.class";
import DBConnection from "../../shared/pgdb-manager.module";
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
      const connection = DBConnection.getConnection();
      await connection`SELECT 1 AS test`;
      databaseStatus = "UP";
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
      const connection = DBConnection.getConnection();
      const startTime = Date.now();

      // Test basic connectivity
      await connection`SELECT 1 AS test`;

      // Test migrations table
      const migrationCheck = await connection`
        SELECT COUNT(*) as count FROM migrations
      `;

      const responseTime = Date.now() - startTime;

      this.sendSuccess(reply, "Database connectivity check passed", {
        status: "UP",
        responseTime: `${responseTime}ms`,
        migrations: {
          applied: parseInt(migrationCheck[0].count as string, 10),
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
