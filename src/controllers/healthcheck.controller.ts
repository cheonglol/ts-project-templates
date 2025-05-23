import { Controller, Get } from "../decorators/route.decorators";
import { FastifyRequest, FastifyReply } from "fastify";
import { Response } from "../common/class/response.class";

@Controller("/healthcheck")
export class HealthCheckController {
  @Get("/")
  async checkHealth(_request: FastifyRequest, _reply: FastifyReply) {
    return Response.createSuccessResponse("Service is healthy", {
      status: "UP",
      timestamp: new Date().toISOString(),
    });
  }

  @Get("/detailed")
  async getDetailedHealth(_request: FastifyRequest, _reply: FastifyReply) {
    // Collect system metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    return Response.createSuccessResponse("Health check details", {
      status: "UP",
      uptime: `${uptime.toFixed(2)} seconds`,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
