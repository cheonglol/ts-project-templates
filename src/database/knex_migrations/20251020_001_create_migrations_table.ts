import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("migrations");
  if (!exists) {
    await knex.schema.createTable("migrations", (table) => {
      table.text("filename").primary();
      table.string("checksum", 64).notNullable();
      table.timestamp("applied_at", { useTz: true }).defaultTo(knex.fn.now());
    });
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_migrations_filename ON migrations(filename);");
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("migrations");
}
