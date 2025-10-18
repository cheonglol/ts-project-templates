import { LogLevel, LogOutputFormat } from "./loggerConfig";

/**
 * Format timestamp for logging
 */
export const formatTimestamp = (date = new Date()): string => {
  return date.toLocaleString("en-SG", { timeZone: "Asia/Singapore" });
};

/**
 * Format log level for display
 */
export const formatLogLevel = (level: LogLevel): string => {
  switch (level) {
    case LogLevel.DEBUG:
      return "DEBUG";
    case LogLevel.INFO:
      return "INFO";
    case LogLevel.WARN:
      return "WARN";
    case LogLevel.ERROR:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
};

/**
 * Formats a message for logging with consistent structure
 */
export const formatLogMessage = ({
  level,
  tag,
  funcName,
  message,
  format = LogOutputFormat.DETAILED,
}: {
  level: LogLevel;
  tag: string;
  funcName: string;
  message: unknown;
  format?: LogOutputFormat;
}): string => {
  const timestamp = formatTimestamp();
  const levelStr = formatLogLevel(level);

  // Format the message based on its type
  let formattedMessage: string;
  if (message instanceof Error) {
    formattedMessage = `${message.message}\n${message.stack || ""}`;
  } else if (typeof message === "object" && message !== null) {
    try {
      formattedMessage = "\n" + JSON.stringify(message, null, 2);
    } catch (err) {
      // Fallback to string conversion if JSON.stringify fails
      if (err instanceof Error) {
        formattedMessage = `${err.message}\n${err.stack || ""}`;
      } else {
        formattedMessage = String(err);
      }
      formattedMessage = String(message);
    }
  } else {
    formattedMessage = String(message);
  }

  // Choose output format
  switch (format) {
    case LogOutputFormat.SIMPLE:
      return `[${levelStr}] ${formattedMessage}`;

    case LogOutputFormat.COMPACT:
      return `[${timestamp}] [${levelStr}] [${tag}] ${formattedMessage}`;

    case LogOutputFormat.JSON:
      return JSON.stringify({
        timestamp,
        level: levelStr,
        tag,
        function: funcName,
        message: typeof message === "object" ? message : formattedMessage,
      });

    case LogOutputFormat.DETAILED:
    default:
      return `[${timestamp}] [${levelStr}] [${tag}] [${funcName}] ${formattedMessage}`;
  }
};
