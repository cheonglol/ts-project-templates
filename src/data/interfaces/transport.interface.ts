import { APP_ERROR_CODE } from "../enums/error-codes.enum";

/**
 * Standard response body structure for all HTTP endpoints
 * @template T The type of the payload data
 */
export interface IStandardResponseBody<T = unknown> {
  success: boolean;
  msg?: string;
  payload: T;
}

/**
 * Standard error response format extended from IStandardResponseBody
 * Used for detailed error information with app-specific error codes
 */
export interface IErrorResponseBody {
  success: boolean;
  msg?: string;
  payload: unknown;
  appErrorCode: APP_ERROR_CODE;
  errorMessage?: string; // Added for backward compatibility
  errorObject?: unknown; // Added for backward compatibility
  errorDetails?: unknown;
}

// Legacy interface - kept for backward compatibility
// Consider using IErrorResponseBody for new code
export interface IResponseModel_ErrorData {
  appErrorCode: APP_ERROR_CODE;
  errorMessage: string;
  errorObject?: unknown | null | undefined;
}
