/**
 * Tags for categorizing log messages
 */
export enum LoggingTags {
  LOG = "LOG",
  SYSTEM = "SYSTEM",
  STARTUP = "STARTUP",
  SHUTDOWN = "SHUTDOWN",
  REQUEST = "REQUEST",
  RESPONSE = "RESPONSE",
  ERROR = "ERROR",
  WARNING = "WARNING",
  DEBUG = "DEBUG",
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  DATABASE = "DATABASE",
  EXTERNAL_API = "EXTERNAL_API",
  PERFORMANCE = "PERFORMANCE",
  API_REQUEST = "API_REQUEST",
  API_RESPONSE = "API_RESPONSE",
}

// For backward compatibility - this allows both LogTags and LoggingTags to be used
export { LoggingTags as LogTags };
export default LoggingTags;
