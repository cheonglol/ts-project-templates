import dotenv from "dotenv";
import fastify from "fastify";
import logger from "./logging/logger";
import { validateEnvironment, EnvVarKeys } from "./modules/env-validation.module";
import healthcheckRoutes from "./routes/healthcheck.routes";
import setupErrorHandling from "./modules/server-error-handler.module";
import { CronJobServiceInstance } from "./services/node-cron.service";
import packageJson from "../package.json";
import LoggingTags from "./enums/logging-tags.enum";

// Import your route files directly here
// import anotherRoutes from "./routes/another.routes';

// Load environment variables
dotenv.config();
validateEnvironment(logger, true);

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

  // Register health check routes
  await server.register(healthcheckRoutes, { prefix: "/healthcheck" });
  logger.info(`Registered health check routes with prefix: /healthcheck`, startServer.name, LoggingTags.STARTUP);

  // Start the server
  try {
    const port = process.env[EnvVarKeys.PORT] ? parseInt(process.env[EnvVarKeys.PORT]!) : parseInt(process.env[EnvVarKeys.HTTP_PORT] || "8080");
    await server.listen({ port, host: "0.0.0.0" }).then(() => {
      // Register cron jobs here if needed
      // Example: CronJobServiceInstance.registerTask({
      //   name: "exampleTask",
      //   schedule: CronJobServiceInstance.getScheduleKey(CRONJOB_TIME_INTERVAL.EVERY_1_MINUTE),
      //   onTick: () => {
      //     console.log("Cron job executed");
      //   },
      // });
      // Start cron jobs
      CronJobServiceInstance.startCronJobs();
      logger.info(`'${packageJson.name}' started on port ${port}`, startServer.name, LoggingTags.STARTUP);
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
