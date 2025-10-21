import { Logger } from "./logging";

type EnvironmentVariable = {
  description?: string;
  name: string;
  required?: boolean;
  validator?: (val: string) => boolean;
};

// list of environment variable descriptors
export const APPLICATION_ENVIRONMENT_VARIABLES: EnvironmentVariable[] = [
  {
    description: "Node environment",
    name: "NODE_ENV",
  },
  {
    description: "Ollama API Service URL",
    name: "OLLAMA_SERVICE_URL",
  },
  {
    description: "Optional test override model",
    name: "OLLAMA_TEST_MODEL",
  },
  {
    description: "Optional test model name",
    name: "DEEPSEEK_MODEL",
  },
  {
    description: "Require structured JSON in tests",
    name: "OLLAMA_REQUIRE_STRUCTURED",
  },
  {
    description: "Port for HTTP server to listen on",
    name: "HTTP_PORT",
  },
  {
    description: "Webhook shared secret used to verify incoming webhooks",
    name: "WEBHOOK_SECRET",
  },
  {
    description: "Optional header name to read webhook signature from (defaults to 'x-hub-signature-256')",
    name: "WEBHOOK_SIGNATURE_HEADER",
  },
  {
    description: "HMAC algorithm to use for webhook signature verification (e.g., sha1, sha256)",
    name: "WEBHOOK_SIGNATURE_ALGORITHM",
    validator: (val: string) => /^(sha1|sha256|sha384|sha512)$/i.test(val),
  },
  // DATABASE SETTINGS
  {
    description: "Optional Postgres connection string",
    name: "PSQL_CONNECTION_STRING",
    required: true,
  },
  {
    description: "Minimum pool size for Postgres client",
    name: "PSQL_POOL_MIN",
  },
  {
    description: "Maximum pool size for Postgres client",
    name: "PSQL_POOL_MAX",
  },
  {
    description: "Number of connection retry attempts for Postgres startup",
    name: "PSQL_STARTUP_RETRIES",
  },
  {
    description: "Base backoff in ms for Postgres startup retries (exponential)",
    name: "PSQL_STARTUP_BACKOFF_MS",
  },
  {
    description: "Initialization timeout in ms for Postgres initialize() (0 = disabled)",
    name: "PSQL_INIT_TIMEOUT_MS",
  },
  {
    description: "Enable TLS/SSL for Postgres connections (set to 'true' to enable)",
    name: "PSQL_SSL",
  },
  {
    description: "When TLS is enabled, whether to reject unauthorized certificates (true/false)",
    name: "PSQL_SSL_REJECT_UNAUTHORIZED",
  },
  {
    description: "Optional path to CA certificate file to trust for TLS connections",
    name: "PSQL_SSL_CA",
  },
  {
    description: "Timeout in ms to wait for knex.destroy() during shutdown",
    name: "PSQL_CLOSE_TIMEOUT_MS",
  },
];

// string literal union of environment variable keys
export const CONFIGURABLE_ENV_VAR_NAMES = APPLICATION_ENVIRONMENT_VARIABLES.map((v) => v.name);
export type EnvironmentVariableKey = string;

// read-only mapping { KEY: KEY }
export const EnvVarKeys: Readonly<Record<string, string>> = APPLICATION_ENVIRONMENT_VARIABLES.reduce(
  (accumulatedEnvVars, environmentVariable) => {
    accumulatedEnvVars[environmentVariable.name] = environmentVariable.name;
    return accumulatedEnvVars;
  },
  {} as Record<string, string>
);

export function verifyEnvironmentSetup(logger: Logger, exitOnFailure = true): boolean {
  const missing = APPLICATION_ENVIRONMENT_VARIABLES.filter((environmentVariable) => environmentVariable.required && !process.env[environmentVariable.name]).map(
    (environmentVariable) => `${environmentVariable.name}: ${environmentVariable.description}`
  );
  const invalid = APPLICATION_ENVIRONMENT_VARIABLES.filter((environmentVariable) => {
    const val = process.env[environmentVariable.name];
    return val && environmentVariable.validator && !environmentVariable.validator(val);
  }).map((v) => `${v.name}: got "${process.env[v.name]}"`);
  if (missing.length) logger.error("validateEnvironment", `Missing variables:\n- ${missing.join("\n- ")}`);
  if (invalid.length) logger.error("validateEnvironment", `Invalid variables:\n- ${invalid.join("\n- ")}`);
  const ok = missing.length === 0 && invalid.length === 0;
  if (!ok && exitOnFailure) {
    logger.error("validateEnvironment", "Exiting due to environment validation failure");
    process.exit(1);
  }

  logger.info("validateEnvironment", "Environment validation successful");
  return ok;
}

export default { validateEnvironment: verifyEnvironmentSetup, APPLICATION_ENVIRONMENT_VARIABLES, EnvVarKeys };
