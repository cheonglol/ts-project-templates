import * as os from "os";
import { FastifyRequest, FastifyReply } from "fastify";
import { Response } from "../common/class/response.class";

export class HealthCheckController {
  async checkHealth(_request: FastifyRequest, _reply: FastifyReply) {
    return Response.createSuccessResponse("Service is healthy", {
      status: "UP",
      timestamp: new Date().toISOString(),
    });
  }

  async getMetrics(_request: FastifyRequest, _reply: FastifyReply) {
    // System-wide memory info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = (usedMem / totalMem) * 100;

    // CPU load
    const loadAvg = os.loadavg();

    // Collect process metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Calculate Node.js process memory as percentage of system memory
    const processMemoryPercent = (memoryUsage.rss / totalMem) * 100;
    // Create summary text
    const summary = `This server is using ${Math.round(memoryUsage.rss / 1024 / 1024)}MB of memory (${processMemoryPercent.toFixed(1)}% of total system memory) and has been running for ${Math.floor(uptime / 60)} minutes. System has ${os.cpus().length} CPU cores with current load at ${loadAvg[0].toFixed(1)}.`;

    return Response.createSuccessResponse("Health check details", {
      status: "UP",
      summary,
      nodeProcess: {
        memory: {
          used: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          percentOfSystem: `${processMemoryPercent.toFixed(2)}%`,
        },
        cpu: {
          coreCount: os.cpus().length,
          currentLoad: `${loadAvg[0].toFixed(2)}`,
        },
      },
      systemOverall: {
        memory: {
          totalAvailable: `${Math.round(totalMem / 1024 / 1024)} MB`,
          totalUsed: `${Math.round(usedMem / 1024 / 1024)} MB`,
          usagePercent: `${memPercent.toFixed(2)}%`,
        },
        cpu: {
          coreCount: os.cpus().length,
          averageLoad: `${loadAvg[0].toFixed(2)}`,
        },
      },
      timestamp: new Date().toISOString(),
    });
  }
}
