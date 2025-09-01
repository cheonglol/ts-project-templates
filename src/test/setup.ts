// Jest setup file - runs before each test suite
import { setupTestEnvironment, resetLogger } from "./test-helper";

// Setup test environment before all tests
beforeAll(() => {
  setupTestEnvironment();
});

// Reset logger instance before each test to prevent state leakage
beforeEach(() => {
  resetLogger();
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  resetLogger();
});
