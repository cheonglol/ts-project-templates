import { HealthCheckController } from "@/controllers/healthcheck.controller";
import { FastifyInstance } from "fastify";

export default async function healthcheckRoutes(fastify: FastifyInstance): Promise<void> {
  const healthCheckController = new HealthCheckController();
  fastify.get("/", (request, reply) => healthCheckController.checkHealth(request, reply));
  fastify.get("/metrics", (request, reply) => healthCheckController.getMetrics(request, reply));
}
