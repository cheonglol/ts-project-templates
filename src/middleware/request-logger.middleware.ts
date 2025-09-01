import { FastifyRequest, FastifyReply } from "fastify";
import LoggingTags from "src/enums/logging-tags.enum";
import logger from "src/logging";

/**
 * Middleware to log all HTTP requests and responses
 * This tracks request metadata and response times
 */
export async function requestLoggerMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const startTime = process.hrtime();

  // Log the incoming request
  logger.info(
    {
      method: request.method,
      url: request.url,
      ip: request.ip,
      headers: {
        userAgent: request.headers["user-agent"],
        contentType: request.headers["content-type"],
      },
      query: request.query,
      params: request.params,
    },
    requestLoggerMiddleware.name,
    LoggingTags.REQUEST
  );

  // We'll use the onResponse hook instead of trying to add a hook to the reply
  reply.raw.on("finish", () => {
    const hrDuration = process.hrtime(startTime);
    const duration = (hrDuration[0] * 1000 + hrDuration[1] / 1000000).toFixed(2);

    logger.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration: `${duration}ms`,
      },
      requestLoggerMiddleware.name,
      LoggingTags.RESPONSE
    );
  });
}

export default requestLoggerMiddleware;
