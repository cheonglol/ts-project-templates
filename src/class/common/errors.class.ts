/**
 * Error handling system for JustifyPrint Chatbot Service
 */

import { HttpStatusCode } from "axios";

// Error categories
export enum ErrorCategory {
  VALIDATION = "VALIDATION",
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  EXTERNAL_SERVICE = "EXTERNAL_SERVICE",
  DATABASE = "DATABASE",
  SERVER = "SERVER",
  UNKNOWN = "UNKNOWN",
}

// Specific error codes
export enum ErrorCode {
  // Validation errors (400)
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FORMAT = "INVALID_FORMAT",

  // Authentication errors (401)
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  INVALID_TOKEN = "INVALID_TOKEN",

  // Authorization errors (403)
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",

  // Resource errors (404)
  USER_NOT_FOUND = "USER_NOT_FOUND",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",

  // Conflict errors (409)
  RESOURCE_ALREADY_EXISTS = "RESOURCE_ALREADY_EXISTS",

  // External service errors (varies)
  EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR",
  TIMEOUT = "TIMEOUT",

  // Server errors (500)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",

  // Unknown errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// Base application error class
export class ApplicationError extends Error {
  public readonly name: string;
  public readonly statusCode: number;
  public readonly category: ErrorCategory;
  public readonly errorCode: ErrorCode;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor({
    name = "ApplicationError",
    message,
    statusCode = HttpStatusCode.InternalServerError,
    category = ErrorCategory.UNKNOWN,
    errorCode = ErrorCode.UNKNOWN_ERROR,
    isOperational = true,
    context = {},
  }: {
    name?: string;
    message: string;
    statusCode?: number;
    category?: ErrorCategory;
    errorCode?: ErrorCode;
    isOperational?: boolean;
    context?: Record<string, unknown>;
  }) {
    super(message);

    this.name = name;
    this.statusCode = statusCode;
    this.category = category;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error classes
export class ValidationError extends ApplicationError {
  constructor({ message, errorCode = ErrorCode.INVALID_INPUT, context = {} }: { message: string; errorCode?: ErrorCode; context?: Record<string, unknown> }) {
    super({
      name: "ValidationError",
      message,
      statusCode: HttpStatusCode.BadRequest,
      category: ErrorCategory.VALIDATION,
      errorCode,
      context,
    });
  }
}

export class AuthenticationError extends ApplicationError {
  constructor({ message, errorCode = ErrorCode.INVALID_CREDENTIALS, context = {} }: { message: string; errorCode?: ErrorCode; context?: Record<string, unknown> }) {
    super({
      name: "AuthenticationError",
      message,
      statusCode: HttpStatusCode.Unauthorized,
      category: ErrorCategory.AUTHENTICATION,
      errorCode,
      context,
    });
  }
}

export class AuthorizationError extends ApplicationError {
  constructor({ message, errorCode = ErrorCode.INSUFFICIENT_PERMISSIONS, context = {} }: { message: string; errorCode?: ErrorCode; context?: Record<string, unknown> }) {
    super({
      name: "AuthorizationError",
      message,
      statusCode: HttpStatusCode.Forbidden,
      category: ErrorCategory.AUTHORIZATION,
      errorCode,
      context,
    });
  }
}

export class ResourceNotFoundError extends ApplicationError {
  constructor({ message, errorCode = ErrorCode.RESOURCE_NOT_FOUND, context = {} }: { message: string; errorCode?: ErrorCode; context?: Record<string, unknown> }) {
    super({
      name: "ResourceNotFoundError",
      message,
      statusCode: HttpStatusCode.NotFound,
      category: ErrorCategory.RESOURCE_NOT_FOUND,
      errorCode,
      context,
    });
  }
}

export class ExternalServiceError extends ApplicationError {
  constructor({
    message,
    statusCode = HttpStatusCode.ServiceUnavailable,
    errorCode = ErrorCode.EXTERNAL_API_ERROR,
    context = {},
  }: {
    message: string;
    statusCode?: number;
    errorCode?: ErrorCode;
    context?: Record<string, unknown>;
  }) {
    super({
      name: "ExternalServiceError",
      message,
      statusCode,
      category: ErrorCategory.EXTERNAL_SERVICE,
      errorCode,
      context,
    });
  }
}

export class DatabaseError extends ApplicationError {
  constructor({ message, errorCode = ErrorCode.DATABASE_ERROR, context = {} }: { message: string; errorCode?: ErrorCode; context?: Record<string, unknown> }) {
    super({
      name: "DatabaseError",
      message,
      statusCode: HttpStatusCode.InternalServerError,
      category: ErrorCategory.DATABASE,
      errorCode,
      context,
    });
  }
}
