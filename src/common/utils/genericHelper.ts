import LoggingTags from "src/common/enums/logging-tags.enum";
import logger from "../logging";

const timestamp = () => new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" });

const to12HourFormat = (time: string): string => {
  const [hour, minute] = time.split(":").map(Number);
  const ampm = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12; // Convert to 12-hour format
  return `${formattedHour}:${minute.toString().padStart(2, "0")} ${ampm}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

type LogFunction = (...args: unknown[]) => unknown;
const getFuncName = (func?: string | symbol | LogFunction): string => {
  try {
    if (!func) return "unknown";
    if (typeof func === "function") return func.name || "anonymous";
    if (typeof func === "symbol") return func.description || func.toString();
    return String(func);
  } catch (error) {
    logger.error(`Error getting function name: ${error}`, "getFuncName", LoggingTags.ERROR);
    return "unknown";
  }
};

// Wrapper around the structured logger for backward compatibility
const log = {
  info: (message: unknown, funcName?: string | symbol | LogFunction, tag = LoggingTags.LOG) => {
    try {
      logger.info(message, getFuncName(funcName) || "log.info", tag);
    } catch (error) {
      logger.error(`Failed to log info message: ${error}`, "log.info", LoggingTags.ERROR);
    }
  },
  error: (message: unknown, funcName?: string | symbol | LogFunction, tag = LoggingTags.ERROR) => {
    try {
      logger.error(message, getFuncName(funcName) || "log.error", tag);
    } catch (error) {
      logger.error(`Failed to log error message: ${error}`, "log.error", LoggingTags.ERROR);
    }
  },
  warn: (message: unknown, funcName?: string | symbol | LogFunction, tag = LoggingTags.WARNING) => {
    try {
      logger.warn(message, getFuncName(funcName) || "log.warn", tag);
    } catch (error) {
      logger.warn(`Failed to log warning message: ${error}`, "log.warn", LoggingTags.ERROR);
    }
  },
  custom: (type: "log" | "error" | "warn", message: unknown, funcName?: string | symbol | LogFunction, tag = LoggingTags.LOG) => {
    try {
      const normalizedFuncName = getFuncName(funcName) || `log.custom.${type}`;
      if (type === "error") logger.error(message, normalizedFuncName, tag);
      else if (type === "warn") logger.warn(message, normalizedFuncName, tag);
      else logger.info(message, normalizedFuncName, tag);
    } catch (error) {
      logger.error(`Failed to log ${type} message: ${error}`, "log.custom", LoggingTags.ERROR);
    }
  },
};

export const GenericHelper = {
  to12HourFormat,
  formatDate,
  timestamp,
  log,
};
