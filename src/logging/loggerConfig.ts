/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Output format options for log messages
 */
export enum LogOutputFormat {
  /** Only level and message */
  SIMPLE = "simple",

  /** Timestamp, level, tag, and message */
  COMPACT = "compact",

  /** Timestamp, level, tag, function name, and message */
  DETAILED = "detailed",

  /** JSON format for machine processing */
  JSON = "json",
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum level to log */
  minLevel: LogLevel;

  /** Output format for log messages */
  format: LogOutputFormat;

  /** Enable console output */
  enableConsoleOutput: boolean;

  /** Max message length (0 for unlimited) */
  maxMessageLength?: number;
}
