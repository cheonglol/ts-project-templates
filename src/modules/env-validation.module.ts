/**
 * @fileoverview
 * Environment variable validation module for the scaleup-ai-backend-service Chatbot Service.
 * This module checks for required environment variables and validates their values.
 * If any required variables are missing or invalid, it logs an error and can exit the process.
 * It is used during the startup phase to ensure the service has all necessary configurations.
 *
 */

import { Logger } from "src/logging/logger";

/**
 * Interface representing an environment variable configuration.
 * @interface
 */
interface EnvVar {
  /**
   * The name of the environment variable.
   */
  name: EnvVarKey;
  /**
   * Description of what the environment variable is used for.
   */
  description: string;
  /**
   * Whether the environment variable is required.
   */
  required: boolean;
  /**
   * Optional validator function to check if the value is valid.
   * @param value - The value of the environment variable
   * @returns True if the value is valid, false otherwise
   */
  validator?: (value: string) => boolean;
}

// Unified environment variable keys as a const array (single source of truth)
export const ENV_VAR_KEYS = [
  "CUSTOM_WEBHOOK_SECRET",
  "OLLAMA_SERVICE_URL",
  "OLLAMA_TEST_MODEL",
  "DEEPSEEK_MODEL",
  "OLLAMA_REQUIRE_STRUCTURED",
  "PORT",
  "HTTP_PORT",
  "NODE_ENV",
] as const;

export type EnvVarKey = (typeof ENV_VAR_KEYS)[number];

// Provide a convenient lookup object (read-only) to keep existing callsites working
export const EnvVarKeys: { readonly [K in EnvVarKey]: K } = ENV_VAR_KEYS.reduce(
  (acc, k) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (acc as any)[k] = k;
    return acc;
  },
  {} as { [k in EnvVarKey]: k }
) as { readonly [K in EnvVarKey]: K };

// Required environment variables
const ENV_VARS: EnvVar[] = [
  { name: "CUSTOM_WEBHOOK_SECRET", description: "Secret for webhook signature verification", required: false },
  { name: "OLLAMA_SERVICE_URL", description: "Ollama API Service URL", required: true },
  { name: "OLLAMA_TEST_MODEL", description: "Optional test override model", required: false },
  { name: "DEEPSEEK_MODEL", description: "Optional test model name", required: false },
  { name: "OLLAMA_REQUIRE_STRUCTURED", description: "Require structured JSON in tests", required: false },
  { name: "PORT", description: "Port for the server", required: false },
  { name: "HTTP_PORT", description: "HTTP port for the server", required: false },
  { name: "NODE_ENV", description: "Node environment", required: false },
];

/**
 * Validates that all required environment variables are present and valid.
 *
 * @param logger - The logger instance to use for logging validation results
 * @param exitOnFailure - Whether to exit the process if validation fails
 * @returns True if all required environment variables are present and valid, false otherwise
 */
export function validateEnvironment(logger: Logger, exitOnFailure = true): boolean {
  const missing: string[] = [];
  const invalid: string[] = [];

  ENV_VARS.forEach((v) => {
    const value = process.env[v.name];

    if (v.required && !value) {
      missing.push(`${v.name}: ${v.description}`);
    } else if (value && v.validator && !v.validator(value)) {
      invalid.push(`${v.name}: got "${value}"`);
    }
  });
  if (missing.length || invalid.length) {
    if (missing.length) {
      logger.error(validateEnvironment.name, `Missing variables:\n- ${missing.join("\n- ")}`);
    }

    if (invalid.length) {
      logger.error(validateEnvironment.name, `Invalid variables:\n- ${invalid.join("\n- ")}`);
    }

    if (exitOnFailure) {
      logger.error(validateEnvironment.name, "Exiting due to environment validation failure");
      process.exit(1);
    }
    return false;
  }

  logger.info(validateEnvironment.name, "Environment validation successful");
  return true;
}

export default { validateEnvironment };
