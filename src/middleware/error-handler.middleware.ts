import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ApplicationError, ErrorCategory, HttpStatusCode } from "../common/class/errors.class";
import { APP_ERROR_CODE } from "../common/enums/errorCodes.enum";
import { IStandardResponseBody } from "../common/interfaces/transport.interface";
import logger from "../common/logging";
import LoggingTags from "../common/enums/logging-tags.enum";

/**
 * Global error handler for the Fastify application
 * Processes all uncaught exceptions and returns standardized error responses
 */
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // Log the error with details
  logger.error(
    {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      params: request.params,
      query: request.query,
      headers: request.headers,
    },
    errorHandler.name,
    LoggingTags.ERROR
  );

  // Default error response
  let errorResponse: IStandardResponseBody = {
    success: false,
    msg: "An unexpected error occurred",
    payload: {
      appErrorCode: APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
    },
  };

  // Set appropriate status code
  let statusCode = HttpStatusCode.INTERNAL_SERVER_ERROR;

  // Process ApplicationError instances for more specific responses
  if (error instanceof ApplicationError) {
    statusCode = error.statusCode;
    errorResponse = {
      success: false,
      msg: error.message,
      payload: {
        appErrorCode: mapCategoryToAppErrorCode(error.category),
        errorCode: error.errorCode,
        context: error.context,
      },
    };
  } else if (error.validation) {
    // Handle Fastify validation errors
    statusCode = HttpStatusCode.BAD_REQUEST;
    errorResponse = {
      success: false,
      msg: "Validation error",
      payload: {
        appErrorCode: APP_ERROR_CODE.VALIDATION_ERROR,
        validationErrors: error.validation,
      },
    };
  }

  // Send the error response
  reply.code(statusCode).type("application/json").send(errorResponse);
}

// Helper function to map error categories to app error codes
function mapCategoryToAppErrorCode(category: ErrorCategory): APP_ERROR_CODE {
  switch (category) {
    case ErrorCategory.VALIDATION:
      return APP_ERROR_CODE.VALIDATION_ERROR;
    case ErrorCategory.AUTHENTICATION:
      return APP_ERROR_CODE.AUTHENTICATION_ERROR;
    case ErrorCategory.AUTHORIZATION:
      return APP_ERROR_CODE.AUTHORIZATION_ERROR;
    case ErrorCategory.RESOURCE_NOT_FOUND:
      return APP_ERROR_CODE.NOT_FOUND;
    case ErrorCategory.EXTERNAL_SERVICE:
      return APP_ERROR_CODE.EXTERNAL_SERVICE_ERROR;
    case ErrorCategory.DATABASE:
      return APP_ERROR_CODE.DATABASE_ERROR;
    case ErrorCategory.SERVER:
    case ErrorCategory.UNKNOWN:
    default:
      return APP_ERROR_CODE.INTERNAL_SERVER_ERROR;
  }
}

export default errorHandler;
