import fs from "fs/promises";
import path from "path";
import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const sqlPath = path.resolve(__dirname, "..", "migrations", "002_create_users_table.sql");
  const sql = await fs.readFile(sqlPath, "utf8");
  await knex.transaction(async (trx) => {
    await trx.raw(sql);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("users");
}
