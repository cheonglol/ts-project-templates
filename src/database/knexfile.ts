import path from "path";
import dotenv from "dotenv";
import { EnvVarKeys } from "../shared/env-validation.module";
dotenv.config();

const connection = process.env[EnvVarKeys.PSQL_CONNECTION_STRING];
if (!connection) {
  console.warn("Warning: PSQL_CONNECTION_STRING not set. Knex CLI may fail until an env var is provided.");
}

const config = {
  development: {
    client: "pg",
    connection,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: path.resolve(__dirname, "src", "database", "knex_migrations"),
      tableName: "knex_migrations",
    },
  },
};

export default config;
