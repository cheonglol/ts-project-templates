import LoggingTags from "src/common/enums/logging-tags.enum";
import { Logger } from "../common/logging";

/**
 * Environment variable validation module.
 */
interface EnvVar {
  name: string;
  description: string;
  required: boolean;
  validator?: (value: string) => boolean;
}

// Required environment variables
const ENV_VARS: EnvVar[] = [
  // { name: "HTTP_PORT", description: "HTTP port number", required: true, validator: (v) => !isNaN(Number(v)) },
  // { name: "HTTPS_PORT", description: "HTTPS port number", required: true, validator: (v) => !isNaN(Number(v)) },
  // { name: "LISTEN_HTTP_ONLY", description: "Listen only on HTTP", required: true, validator: (v) => v === 'true' || v === 'false' },
  // { name: "HTTPS_KEY_PATH", description: "HTTPS key file path", required: true },
  // { name: "HTTPS_CERT_PATH", description: "HTTPS certificate file path", required: true },
  // { name: "USE_CORS", description: "Enable CORS", required: true, validator: (v) => v === 'true' || v === 'false' },
  // { name: "AES_SECRET_KEY", description: "AES encryption key", required: true },
  // { name: "SUPABASE_URL", description: "Supabase URL", required: true },
  // { name: "SUPABASE_DATABASE_URL", description: "Supabase database URL", required: true },
  // { name: "SUPABASE_REST_V1", description: "Supabase REST endpoint", required: true },
  // { name: "SUPABASE_SERVICE_ROLE_KEY", description: "Supabase service role key", required: true },
  { name: "LLM_PROVIDER_GEMINI_API_KEY", description: "Gemini API key", required: true },
];

/**
 * Validate environment variables
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
      logger.error(validateEnvironment.name, `Missing variables:\n- ${missing.join("\n- ")}`, LoggingTags.STARTUP);
    }

    if (invalid.length) {
      logger.error(validateEnvironment.name, `Invalid variables:\n- ${invalid.join("\n- ")}`, LoggingTags.STARTUP);
    }

    if (exitOnFailure) {
      logger.error(validateEnvironment.name, "Exiting due to environment validation failure", LoggingTags.STARTUP);
      process.exit(1);
    }
    return false;
  }

  logger.info(validateEnvironment.name, "Environment validation successful", LoggingTags.STARTUP);
  return true;
}

export default { validateEnvironment };
