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
    description: "Ollama API Service URL",
    name: "OLLAMA_SERVICE_URL",
    required: true,
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
    description: "Port for the server",
    name: "PORT",
  },
  {
    description: "HTTP port for the server",
    name: "HTTP_PORT",
  },
  {
    description: "Number of connection retry attempts for DB startup",
    name: "STARTUP_DB_RETRIES",
  },
  {
    description: "Base backoff in ms for DB startup retries (exponential)",
    name: "STARTUP_DB_BACKOFF_MS",
  },
  {
    description: "Initialization timeout in ms for database initialize() (0 = disabled)",
    name: "INIT_DB_TIMEOUT_MS",
  },
  {
    description: "Node environment",
    name: "NODE_ENV",
  },
];

// string literal union of environment variable keys
export const ENV_VAR_KEYS = APPLICATION_ENVIRONMENT_VARIABLES.map((v) => v.name);
export type EnvironmentVariableKey = string;

// read-only mapping { KEY: KEY }
export const EnvVarKeys: Readonly<Record<string, string>> = APPLICATION_ENVIRONMENT_VARIABLES.reduce(
  (acc, cur) => {
    acc[cur.name] = cur.name;
    return acc;
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
