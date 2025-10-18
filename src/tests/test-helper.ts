// Test helper utilities

import { EnvVarKeys } from "../shared/env-validation.module";
import { Logger } from "../shared/logging/logger";
import { LogLevel } from "../shared/logging/loggerConfig";

export const setupTestEnvironment = () => {
  // Setup code for tests, e.g., environment variables, mocks, etc.
  process.env[EnvVarKeys.NODE_ENV] = "test";
};

export const teardownTestEnvironment = () => {
  // Cleanup code after tests
  Logger.resetInstance();
  jest.restoreAllMocks();
};

export const createMockData = <T>(data: T): T => {
  return data;
};

// Repository testing utilities
export const createMockDatabaseConnection = () => {
  return {
    query: jest.fn(),
    queryOne: jest.fn(),
    execute: jest.fn(),
    transaction: jest.fn(),
  };
};

export const createMockRepository = <T extends Record<string, unknown>>() => {
  return {
    findAll: jest.fn<Promise<T[]>, []>(),
    findById: jest.fn<Promise<T | null>, [string | number]>(),
    create: jest.fn<Promise<T>, [Partial<T>]>(),
    update: jest.fn<Promise<T | null>, [string | number, Partial<T>]>(),
    delete: jest.fn<Promise<boolean>, [string | number]>(),
    findAllPaginated: jest.fn<Promise<{ items: T[]; total: number }>, [number, number]>(),
  };
};

export const createMockService = <T extends Record<string, unknown>>() => {
  return {
    findAll: jest.fn<Promise<T[]>, []>(),
    findById: jest.fn<Promise<T | null>, [string | number]>(),
    create: jest.fn<Promise<T>, [Partial<T>]>(),
    update: jest.fn<Promise<T | null>, [string | number, Partial<T>]>(),
    delete: jest.fn<Promise<boolean>, [string | number]>(),
    findAllPaginated: jest.fn<Promise<{ items: T[]; total: number }>, [number, number]>(),
  };
};

// Logger testing utilities
export const mockLogger = () => {
  const mockConsole = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  // Mock console methods
  global.console.log = mockConsole.log;
  global.console.error = mockConsole.error;
  global.console.warn = mockConsole.warn;

  return mockConsole;
};

export const createTestLogger = (config?: { minLevel?: LogLevel; enableConsoleOutput?: boolean }) => {
  return Logger.createTestInstance({
    minLevel: config?.minLevel ?? LogLevel.DEBUG,
    enableConsoleOutput: config?.enableConsoleOutput ?? false,
    ...config,
  });
};

export const resetLogger = () => {
  Logger.resetInstance();
};

// Pretty log printing with location information
(() => {
  const readEnv = (k: string) => (process.env as Record<string, string | undefined>)[k];
  if (readEnv("TEST_LOG_MODE") === "verbose") return; // opt-out

  const allowWarn = [/ExperimentalWarning/i];
  const state = { suppressedErr: 0, suppressedWarn: 0, suppressedInfo: 0, unexpected: [] as string[] };

  // Stack location extractor
  const extractOriginalLocation = () => {
    const lines = new Error().stack?.split("\n").slice(1) || [];
    for (const raw of lines) {
      if (raw.includes("test-helper.ts") || raw.includes("@jest/") || raw.includes("node:internal")) continue;
      const line = raw.trim().replace(/^at\s+/, "");
      const m = line.match(/\(([^)]+)\)$/);
      const loc = m ? m[1] : line;
      return loc;
    }
    return "";
  };

  const writeWithLocation = (stream: NodeJS.WriteStream, msg: string) => {
    const loc = extractOriginalLocation();
    const filenameOnly = loc ? loc.split(/[\\/]/).pop() || loc : "";
    const header = filenameOnly ? `\n\n\n${filenameOnly} > ` : "";

    if (!(writeWithLocation as unknown as { last?: string }).last) {
      (writeWithLocation as unknown as { last?: string }).last = "";
    }
    const last = (writeWithLocation as unknown as { last?: string }).last;

    if (header && header !== last) {
      stream.write(`${header}\n${msg}\n`);
      (writeWithLocation as unknown as { last?: string }).last = header;
    } else {
      stream.write(msg + "\n\n");
    }
  };

  const patch = (method: "error" | "warn" | "log", allow: RegExp[] | null, counterKey: keyof typeof state) => {
    const stream = method === "error" ? process.stderr : process.stdout;
    console[method] = (...args: unknown[]) => {
      const msg = args.map((a) => formatLogArg(a)).join(" ");
      if (method === "log") {
        if (/^\[[0-9]{2}\/\d{2}\/\d{4}/.test(msg) && !/^\[log-hygiene]/i.test(msg)) {
          state.suppressedInfo++;
          return;
        }
      } else if (allow && allow.some((r) => r.test(msg))) {
        state[counterKey]++;
        return;
      }
      if (method === "error") state.unexpected.push(msg);
      writeWithLocation(stream, msg);
    };
  };

  patch("error", null, "suppressedErr");
  patch("warn", allowWarn, "suppressedWarn");
  patch("log", null, "suppressedInfo");

  afterEach(async () => {
    await flushAsyncTicks();
  });

  process.on("beforeExit", () => {
    if (state.unexpected.length) {
      state.unexpected.forEach((m) => process.stderr.write(m + "\n"));
      throw new Error(`Unexpected console.error logs (${state.unexpected.length})`);
    } else {
      process.stdout.write(`[log-hygiene] 0 unexpected errors. Suppressed ${state.suppressedErr} error + ${state.suppressedWarn} warn + ${state.suppressedInfo} info logs.\n`);
    }
  });
})();

// Pretty formatting helper for any log arg
function formatLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}` + (arg.stack ? `\n${arg.stack}` : "");
  }
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

// Flush async operations helper
async function flushAsyncTicks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Add more helper functions as needed
