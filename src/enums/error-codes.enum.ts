/**
 * Application error codes for standardized error handling
 * These codes are used for client-side error identification and handling
 */
export enum APP_ERROR_CODE {
  // General errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",

  // Authentication/Authorization errors
  UNAUTHORIZED = "UNAUTHORIZED",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",

  // Input validation
  BAD_REQUEST = "BAD_REQUEST",
  VALIDATION_ERROR = "VALIDATION_ERROR",

  // Resource errors
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",

  // External dependencies
  SERVER_ERROR = "SERVER_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",

  // Business logic errors
  BUSINESS_RULE_VIOLATION = "BUSINESS_RULE_VIOLATION",
  OPERATION_REJECTED = "OPERATION_REJECTED",
}
