import dotenv from "dotenv";
import fastify from "fastify";
import packageJson from "../package.json";
import LoggingTags from "./common/enums/logging-tags.enum";
import logger from "./common/logging";
import { validateEnvironment } from "./modules/env-validation.module";
import setupErrorHandling from "./modules/server-error-handler.module";
import healthcheckRoutes from "./routes/healthcheck.routes";

import webhookRoutes from "./routes/webhook.routes";
import LLMService from "./service/llm.service";
import { LLMProviderType } from "./common/enums/llm-provider-types.enum";
import { GEMINI_MODELS } from "./service/llm-providers/gemini/gemini-provider";
// import { CRONJOB_TIME_INTERVAL, initializeNodeCronService } from "./service/node-cron.service";

// Import your route files directly here
// import anotherRoutes from "./routes/another.routes';

// Load environment variables
dotenv.config();
validateEnvironment(logger, true);

// Choose your Gemini model here

async function startServer(): Promise<void> {
  const server = fastify({
    logger: false,
  });

  // Setup error handling and logging
  setupErrorHandling(server);

  // Register base routes
  server.get("/", async () => {
    return { message: "JustifyPrint Chatbot Service is running" };
  });
  logger.info(`Registered route: GET /`, startServer.name, LoggingTags.STARTUP);

  //     _____             _         _____            _     _             _   _
  //  |  __ \           | |       |  __ \          (_)   | |           | | (_)
  //  | |__) |___  _   _| |_ ___  | |__) |___  __ _ _ ___| |_ _ __ __ _| |_ _  ___  _ __
  //  |  _  // _ \| | | | __/ _ \ |  _  // _ \/ _` | / __| __| '__/ _` | __| |/ _ \| '_ \
  //  | | \ \ (_) | |_| | ||  __/ | | \ \  __/ (_| | \__ \ |_| | | (_| | |_| | (_) | | | |
  //  |_|  \_\___/ \__,_|\__\___| |_|  \_\___|\__, |_|___/\__|_|  \__,_|\__|_|\___/|_| |_|
  await server.register(healthcheckRoutes, { prefix: "/healthcheck" });
  await server.register(webhookRoutes, { prefix: "/webhook" });
  logger.info(`Registered health check routes with prefix: /healthcheck`, startServer.name, LoggingTags.STARTUP);

  // Start the server
  try {
    const host = process.env.HOST || "0.0.0.0";
    const port = process.env.PORT ? parseInt(process.env.PORT) : parseInt(process.env.HTTP_PORT || "8081");
    await server.listen({ port, host: host }).then(() => {
      // Initialize and start cron jobs
      // const NodeCronService = initializeNodeCronService();

      // Register cron jobs here if needed
      // Example:
      // NodeCronService.registerTask({
      //   name: "exampleTask",
      //   schedule: CRONJOB_TIME_INTERVAL.EVERY_1_MINUTE,
      //   onTick: () => {
      //     console.log("Example Cron job executed");
      //   },
      // });

      // Start cron jobs
      // NodeCronService.startCronJobs();
      logger.info(`'${packageJson.name}' is now listening on ${host}:${port}`, startServer.name, LoggingTags.STARTUP);

      // Test LLM service with queue monitoring
      try {
        // Explicitly initialize the LLM service with the provider type and model
        const llmService = LLMService.getInstance(LLMProviderType.GEMINI);

        // Configure max concurrent requests if needed
        llmService.setMaxConcurrentRequests(parseInt(process.env.LLM_MAX_CONCURRENT_REQUESTS || "1"));

        // Log initial queue status
        const initialStatus = llmService.getQueueStatus();
        logger.info(
          `LLM queue initial status - Queue: ${initialStatus.queueLength}, Active: ${initialStatus.activeRequests}, Max: ${initialStatus.maxConcurrentRequests}`,
          startServer.name,
          LoggingTags.STARTUP
        );

        // Create a unique session ID for this test
        const sessionId = `sample-session-${Date.now()}`;
        // const sessionId = `sample-session-1748696659913`;

        // Create a chat request instead of a text generation request
        const chatRequest = {
          sessionId: sessionId,
          message: "hello? remember this: im handsome?",
          maxTokens: 50,
          temperature: 1,
          model: GEMINI_MODELS.GEMINI_1p5_FLASH,
        };

        // The request will automatically be queued by the LLM service
        llmService
          .chat(chatRequest)
          .then((response) => {
            logger.info(`LLM chat test successful: ${response.text}`, startServer.name, LoggingTags.STARTUP);
            // Log midpoint queue status
            const midStatus = llmService.getQueueStatus();
            logger.info(`LLM queue midpoint status - Queue: ${midStatus.queueLength}, Active: ${midStatus.activeRequests}`, startServer.name, LoggingTags.STARTUP);

            // Make a follow-up request to demonstrate session continuity
            const followUpRequest = {
              sessionId: sessionId, // Use the same session ID to continue the conversation
              message: "what did i ask you the last time?",
              maxTokens: 100,
              temperature: 0.7,
              model: GEMINI_MODELS.GEMINI_1p5_FLASH,
            };

            return llmService.chat(followUpRequest);
          })
          .then((followUpResponse) => {
            logger.info(`LLM chat follow-up successful: ${followUpResponse.text}`, startServer.name, LoggingTags.STARTUP);
            // Log final queue status
            const finalStatus = llmService.getQueueStatus();
            logger.info(`LLM queue final status - Queue: ${finalStatus.queueLength}, Active: ${finalStatus.activeRequests}`, startServer.name, LoggingTags.STARTUP);
          })
          .catch((error) => {
            logger.error(`LLM test failed: ${error.message}`, startServer.name, LoggingTags.ERROR);
          });
      } catch (error) {
        logger.error(`Failed to initialize LLM test: ${error instanceof Error ? error.message : "Unknown error"}`, startServer.name, LoggingTags.ERROR);
      }
    });
  } catch (err) {
    server.log.error(err);
    logger.error(`Failed to start server: ${err}`, startServer.name, LoggingTags.ERROR);
    process.exit(1);
  }
}

startServer().catch((err) => {
  logger.error(`Unhandled error during server startup: ${err}`, "main", LoggingTags.ERROR);
  process.exit(1);
});
