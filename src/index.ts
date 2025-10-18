import dotenv from "dotenv";
import fastify from "fastify";
import packageJson from "../package.json";
import { CronJobServiceInstance } from "./class/services/node-cron.service";
import LoggingTags from "./data/enums/logging-tags.enum";
import healthcheckRoutes from "./routes/healthcheck.routes";
import { EnvVarKeys, verifyEnvironmentSetup } from "./shared/env-validation.module";
import logger from "./shared/logging/logger";
import DBConnection from "./shared/pgdb-manager.module";
import setupErrorHandling from "./shared/server-error-handler.module";

// Import your route files directly here
// import anotherRoutes from "./routes/another.routes';

// Load environment variables
dotenv.config();
verifyEnvironmentSetup(logger, true);

async function startServer(): Promise<void> {
  try {
    // Initialize database connection before starting the server
    logger.info("Initializing database connection...", startServer.name, LoggingTags.STARTUP);
    await DBConnection.initialize();
    logger.info("Database connection initialized successfully", startServer.name, LoggingTags.STARTUP);
  } catch (error) {
    logger.error(`Failed to initialize database: ${error}`, startServer.name, LoggingTags.ERROR);
    process.exit(1);
  }

  const server = fastify({
    logger: false,
  });

  // Setup error handling and logging
  setupErrorHandling(server);

  // Register base routes
  server.get("/", async () => {
    return { message: packageJson.name, status: "ok" };
  });

  // Register health check routes
  await server.register(healthcheckRoutes, { prefix: "/healthcheck" });
  logger.info(`Registered health check routes with prefix: /healthcheck`, startServer.name, LoggingTags.STARTUP);

  // Start the server
  try {
    const portRaw = process.env[EnvVarKeys.PORT] ?? process.env[EnvVarKeys.HTTP_PORT] ?? "8080";
    const port = parseInt(String(portRaw), 10);
    await server.listen({ port, host: "0.0.0.0" }).then(() => {
      // Register cron jobs here if needed
      // Example: CronJobServiceInstance.registerTask({
      //   name: "exampleTask",
      //   schedule: CronJobServiceInstance.getScheduleKey(CRONJOB_TIME_INTERVAL.EVERY_1_MINUTE),
      //   onTick: () => {
      //     console.log("Cron job executed");
      //   },
      // });
      CronJobServiceInstance.startCronJobs(); // Start cron jobs
      logger.info(`'${packageJson.name}' started on port ${port}`, startServer.name, LoggingTags.STARTUP);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`, startServer.name, LoggingTags.STARTUP);

      try {
        // Stop cron jobs
        CronJobServiceInstance.stopAllCronJobs();
        logger.info("Cron jobs stopped", startServer.name, LoggingTags.STARTUP);

        // Close server
        await server.close();
        logger.info("Server closed", startServer.name, LoggingTags.STARTUP);

        // Close database connection
        await DBConnection.close();
        logger.info("Database connection closed", startServer.name, LoggingTags.STARTUP);

        logger.info("Graceful shutdown completed", startServer.name, LoggingTags.STARTUP);
        process.exit(0);
      } catch (error) {
        logger.error(`Error during graceful shutdown: ${error}`, startServer.name, LoggingTags.ERROR);
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (err) {
    server.log.error(err);
    logger.error(`Failed to start server: ${err}`, startServer.name, LoggingTags.ERROR);
    await DBConnection.close();
    process.exit(1);
  }
}

startServer().catch(async (err) => {
  logger.error(`Unhandled error during server startup: ${err}`, "main", LoggingTags.ERROR);
  // Attempt to close database connection on startup failure
  try {
    await DBConnection.close();
  } catch (dbError) {
    logger.error(`Error closing database connection during shutdown: ${dbError}`, "main", LoggingTags.ERROR);
  } finally {
    process.exit(1);
  }
});
