import logger, { Logger } from "./logger";
import { LogLevel, LogOutputFormat, LoggerConfig } from "./loggerConfig";
import { formatLogMessage, formatTimestamp } from "./logFormatter";

// Export all components
export { logger as default, Logger, LogLevel, LogOutputFormat, formatLogMessage, formatTimestamp };
export type { LoggerConfig };
