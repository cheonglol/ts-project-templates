import { FastifyRequest, FastifyReply } from "fastify";
import { BaseController } from "../class/common/base-controller.class";

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

    this.sendSuccess(reply, "Health check details", {
      status: "UP",
      uptime: `${uptime.toFixed(2)} seconds`,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      },
    });
  }
}
