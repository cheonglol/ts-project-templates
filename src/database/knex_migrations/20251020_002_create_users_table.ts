import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("users");
  if (!exists) {
    await knex.schema.createTable("users", (table) => {
      table.increments("id").primary();
      table.string("email", 255).notNullable().unique();
      table.string("name", 255).notNullable();
      table.string("status", 50).defaultTo("active");

      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("deleted_at").nullable();

      // Extended fields - added in later migration originally, keep columns present here
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("phone", 20);
      table.text("avatar_url");
      table.text("bio");
      table.string("timezone", 50).defaultTo("UTC");
      table.string("locale", 10).defaultTo("en-US");
      table.timestamp("last_login_at").nullable();
      table.timestamp("email_verified_at").nullable();
      table.boolean("is_admin").notNullable().defaultTo(false);
    });

    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);");
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_users_email_verified_at ON users(email_verified_at);");
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("users");
}
