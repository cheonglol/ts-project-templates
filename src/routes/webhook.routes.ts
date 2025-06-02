import { FastifyInstance } from "fastify";
import { WebhookController } from "../controllers/webhook.controller";

export default async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  const webhookController = new WebhookController();
  fastify.post("/handle", async (request, reply) => {
    return webhookController.handleWebhook(request, reply);
  });
}
