import { IResponseModel_ErrorData, IStandardResponseBody } from "../data/interfaces/transport.interface";
import { Response, ResponseStatus } from "../class/common/response.class";
import { ApplicationError, ErrorCategory, ErrorCode } from "../class/common/errors.class";
import { APP_ERROR_CODE } from "../data/enums/error-codes.enum";
import logger from "../shared/logging";
import { AxiosError } from "axios";
import LoggingTags from "../data/enums/logging-tags.enum";

/**
 * Checks if an error is an ApplicationError
 */
export const isApplicationError = (error: unknown): error is ApplicationError => {
  return error instanceof ApplicationError;
};

/**
 * Handles an error and returns a standardized Response object
 * @param error The error that occurred
 * @param funcName Optional function name for logging purposes
 * @returns Response object with error information
 */
export const handleError = (error: unknown, funcName?: string): Response => {
  if (funcName) {
    logger.error(error instanceof Error ? `${error.message}\n${error.stack}` : error, funcName, LoggingTags.ERROR);
  }

  let errorContent = "Unknown error occurred";
  let errorMetadata: Record<string, unknown> = {
    appErrorCode: APP_ERROR_CODE.UNKNOWN_ERROR,
  };

  if (error instanceof ApplicationError) {
    errorContent = error.message;
    errorMetadata = {
      appErrorCode: getAppErrorCode(error), // Use the getAppErrorCode function
      category: error.category,
      errorCode: error.errorCode,
      statusCode: error.statusCode,
      context: error.context,
    };
  } else if (error instanceof Error) {
    errorContent = error.message;
    errorMetadata.stack = error.stack;
  } else if (typeof error === "string") {
    errorContent = error;
  }

  return Response.createErrorResponse(errorContent, errorMetadata);
};

/**
 * Maps an ApplicationError to the appropriate APP_ERROR_CODE
 */
function getAppErrorCode(error: ApplicationError): APP_ERROR_CODE {
  // Base mapping on error category first
  switch (error.category) {
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
      return APP_ERROR_CODE.INTERNAL_SERVER_ERROR;
    default:
      // For more specific mapping, check error code
      return mapErrorCodeToAppErrorCode(error.errorCode);
  }
}

/**
 * Maps specific ErrorCode to APP_ERROR_CODE for fine-grained mapping
 */
function mapErrorCodeToAppErrorCode(errorCode: ErrorCode): APP_ERROR_CODE {
  switch (errorCode) {
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.MISSING_REQUIRED_FIELD:
    case ErrorCode.INVALID_FORMAT:
      return APP_ERROR_CODE.VALIDATION_ERROR;

    case ErrorCode.INVALID_CREDENTIALS:
    case ErrorCode.TOKEN_EXPIRED:
    case ErrorCode.INVALID_TOKEN:
      return APP_ERROR_CODE.AUTHENTICATION_ERROR;

    case ErrorCode.INSUFFICIENT_PERMISSIONS:
      return APP_ERROR_CODE.AUTHORIZATION_ERROR;

    case ErrorCode.USER_NOT_FOUND:
    case ErrorCode.RESOURCE_NOT_FOUND:
      return APP_ERROR_CODE.NOT_FOUND;

    case ErrorCode.RESOURCE_ALREADY_EXISTS:
      return APP_ERROR_CODE.CONFLICT;

    case ErrorCode.EXTERNAL_API_ERROR:
    case ErrorCode.TIMEOUT:
      return APP_ERROR_CODE.EXTERNAL_SERVICE_ERROR;

    case ErrorCode.DATABASE_ERROR:
      return APP_ERROR_CODE.DATABASE_ERROR;

    case ErrorCode.INTERNAL_ERROR:
      return APP_ERROR_CODE.INTERNAL_SERVER_ERROR;

    default:
      return APP_ERROR_CODE.UNKNOWN_ERROR;
  }
}

/**
 * Extracts error details from a Response object
 */
export function extractErrorDetails(response: Response): IResponseModel_ErrorData | null {
  if (response.getStatus() !== ResponseStatus.ERROR) {
    return null;
  }

  const metadata = response.getMetadata();

  return {
    appErrorCode: (typeof metadata.appErrorCode === "number" ? metadata.appErrorCode : APP_ERROR_CODE.UNKNOWN_ERROR) as APP_ERROR_CODE,
    errorMessage: response.getContent(),
    errorObject: metadata.context || metadata,
  };
}

/**
 * Checks if a response indicates success
 */
export function isSuccess(response: Response): boolean {
  return response.getStatus() === ResponseStatus.SUCCESS;
}

/**
 * Creates a success response with optional metadata
 */
export function createSuccessResponse(content: string, metadata?: Record<string, unknown>): Response {
  return Response.createSuccessResponse(content, metadata);
}

/**
 * Wraps a function execution with error handling, creating appropriate Response
 *
 * @param fn The function to execute
 * @param functionName The name of the function (for error logging)
 * @returns A Response containing the result or error information
 */
export async function executeWithErrorHandling<T>(fn: () => Promise<T>, functionName: string): Promise<Response> {
  try {
    const result = await fn();

    if (result instanceof Response) {
      // If the function already returns a Response, use it directly
      return result;
    }

    // Convert the result to a success Response
    return createSuccessResponse(typeof result === "string" ? result : "Operation completed successfully", typeof result === "string" ? undefined : { data: result });
  } catch (error) {
    return handleError(error, functionName);
  }
}

/**
 * Converts a Response object to the standard response format
 * @param response The Response object to convert
 * @returns A standardized response body
 */
export function toStandardResponse<T = unknown>(response: Response): IStandardResponseBody<T> {
  const isSuccess = response.getStatus() === ResponseStatus.SUCCESS;
  const metadata = response.getMetadata();

  return {
    success: isSuccess,
    msg: response.getContent(),
    payload: isSuccess ? (metadata?.data as T) : (metadata?.error as T),
  };
}

/**
 * Creates a standard success response
 * @param payload The payload data
 * @param message Optional success message
 * @returns A standardized success response
 */
export function createStandardSuccessResponse<T = unknown>(payload: T, message?: string): IStandardResponseBody<T> {
  return {
    success: true,
    msg: message || "Operation successful",
    payload,
  };
}

/**
 * Creates a standard error response
 * @param errorData The error data or message
 * @param payload Optional payload data
 * @returns A standardized error response
 */
export function createStandardErrorResponse<T = unknown>(errorData: string | IResponseModel_ErrorData, payload?: T): IStandardResponseBody<T> {
  if (typeof errorData === "string") {
    return {
      success: false,
      msg: errorData,
      payload: payload as T,
    };
  }

  return {
    success: false,
    msg: errorData.errorMessage,
    payload: (payload || errorData.errorObject || {}) as T,
  };
}

/**
 * Handles Axios errors and creates a standardized error response
 */
export function handleAxiosError(error: AxiosError, context: string): Response {
  let errorMessage = "Unknown error occurred";
  let statusCode: string | undefined;

  if (error.response) {
    statusCode = error.response.status.toString();
    const responseData = error.response.data as Record<string, unknown>;

    errorMessage = `Request failed with status ${statusCode}`;
    if (typeof responseData?.message === "string") {
      errorMessage = responseData.message;
    }
    if (typeof responseData?.error === "string" && errorMessage === `Request failed with status ${statusCode}`) {
      errorMessage = responseData.error;
    }

    logger.error(`${statusCode} - ${errorMessage} (${ResponseStatus.ERROR})`, context, LoggingTags.API_RESPONSE);
  }

  if (error.request && !error.response) {
    errorMessage = "No response received from server";
    logger.error(`Request made but no response received (${ResponseStatus.ERROR})`, context, LoggingTags.API_RESPONSE);
  }

  if (!error.request && !error.response) {
    if (error.message) {
      errorMessage = error.message;
    }
    logger.error(`Request setup error: ${errorMessage} (${ResponseStatus.ERROR})`, context, LoggingTags.API_RESPONSE);
  }

  return new Response({
    content: errorMessage,
    status: ResponseStatus.ERROR,
    metadata: {
      statusCode,
      originalError: error.toJSON(),
    },
  });
}
