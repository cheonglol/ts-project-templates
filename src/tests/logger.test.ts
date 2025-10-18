import { Logger } from "../shared/logging/logger";
import { LogLevel } from "../shared/logging/loggerConfig";
import LoggingTags from "../data/enums/logging-tags.enum";
import { setupTestEnvironment, teardownTestEnvironment, mockLogger, createTestLogger, resetLogger } from "./test-helper";

describe("Logger", () => {
  let mockConsole: ReturnType<typeof mockLogger>;

  beforeEach(() => {
    // Setup test environment
    setupTestEnvironment();

    // Mock console to prevent output during tests
    mockConsole = mockLogger();
  });

  afterEach(() => {
    // Reset logger instance to prevent state leakage between tests
    resetLogger();

    // Restore all mocks
    teardownTestEnvironment();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();

      expect(logger1).toBe(logger2);
    });

    it("should reset instance correctly", () => {
      const logger1 = Logger.getInstance();
      Logger.resetInstance();
      const logger2 = Logger.getInstance();

      expect(logger1).not.toBe(logger2);
    });
  });

  describe("Logging Levels", () => {
    it("should log debug messages when level is DEBUG", () => {
      const testLogger = createTestLogger({
        minLevel: LogLevel.DEBUG,
        enableConsoleOutput: true,
      });

      testLogger.debug("Test debug message", "testFunction");

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it("should not log debug messages when level is INFO", () => {
      const testLogger = createTestLogger({
        minLevel: LogLevel.INFO,
        enableConsoleOutput: true,
      });

      testLogger.debug("Test debug message", "testFunction");

      expect(mockConsole.log).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle logging errors gracefully", () => {
      const testLogger = createTestLogger({
        enableConsoleOutput: true,
      });

      // Store original console.error
      const originalConsoleError = console.error;

      // Mock console.error to throw an error
      console.error = jest.fn(() => {
        throw new Error("Console error");
      });

      // This should not throw, but log the error internally
      expect(() => {
        testLogger.error("Test error message", "testFunction");
      }).not.toThrow();

      // Restore original console.error
      console.error = originalConsoleError;
    });
  });

  describe("Child Logger", () => {
    it("should create child logger with predefined tag", () => {
      const testLogger = createTestLogger({
        enableConsoleOutput: true,
      });

      const childLogger = testLogger.createChildLogger({
        tag: LoggingTags.LOG,
        funcName: "childFunction",
      });

      childLogger.info("Child message");

      expect(mockConsole.log).toHaveBeenCalled();
    });
  });
});
