// Use string literal for required keys to avoid type-level lookup issues in the test setup
const required = ["PSQL_CONNECTION_STRING"];

function looksLikePlaceholder(conn?: string): boolean {
  if (!conn) return true;
  // Common test placeholder pattern used earlier in the repo
  if (conn.includes("user:pass@localhost") || conn.includes("postgres://user:pass")) return true;
  // Also treat empty / obviously local sqlite like strings as placeholders
  if (conn.trim() === "") return true;
  return false;
}

for (const key of required) {
  const val = process.env[key as keyof NodeJS.ProcessEnv];
  if (!val || looksLikePlaceholder(val)) {
    // Throwing here will cause Jest to fail the suite during setup
    throw new Error(
      `Required environment variable ${key} is not set or appears to be a placeholder. Tests that touch the database will not run against fake data. Set ${key} to a valid Postgres connection string to proceed.`
    );
  }
}

// Optionally export for other test files
// no-op export: keep module scope
