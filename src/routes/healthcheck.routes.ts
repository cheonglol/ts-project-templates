import { HealthCheckController } from "@/controllers/healthcheck.controller";
import { FastifyInstance } from "fastify";

/**
 * Manually register health check routes
 * Note: In a full implementation, these would be auto-registered via RouteRegistrar
 */
export default async function healthcheckRoutes(fastify: FastifyInstance): Promise<void> {
  // These routes mirror what would be automatically registered by the decorator system
  const healthCheckController = new HealthCheckController();

  fastify.get("/", (request, reply) => healthCheckController.checkHealth(request, reply));

  fastify.get("/detailed", (request, reply) => healthCheckController.getDetailedHealth(request, reply));
}
