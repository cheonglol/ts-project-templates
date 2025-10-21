import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // This migration historically added profile fields. If they don't exist, add them.
  // If users table doesn't exist, skip
  const exists = await knex.schema.hasTable("users");
  if (!exists) return;

  // Add columns if missing
  if (!(await knex.schema.hasColumn("users", "first_name"))) {
    await knex.schema.alterTable("users", (table) => {
      table.string("first_name", 100);
    });
  }
  if (!(await knex.schema.hasColumn("users", "last_name"))) {
    await knex.schema.alterTable("users", (table) => {
      table.string("last_name", 100);
    });
  }
  if (!(await knex.schema.hasColumn("users", "phone"))) {
    await knex.schema.alterTable("users", (table) => {
      table.string("phone", 20);
    });
  }
  if (!(await knex.schema.hasColumn("users", "avatar_url"))) {
    await knex.schema.alterTable("users", (table) => {
      table.text("avatar_url");
    });
  }
  if (!(await knex.schema.hasColumn("users", "bio"))) {
    await knex.schema.alterTable("users", (table) => {
      table.text("bio");
    });
  }
  if (!(await knex.schema.hasColumn("users", "timezone"))) {
    await knex.schema.alterTable("users", (table) => {
      table.string("timezone", 50).defaultTo("UTC");
    });
  }
  if (!(await knex.schema.hasColumn("users", "locale"))) {
    await knex.schema.alterTable("users", (table) => {
      table.string("locale", 10).defaultTo("en-US");
    });
  }
  if (!(await knex.schema.hasColumn("users", "last_login_at"))) {
    await knex.schema.alterTable("users", (table) => {
      table.timestamp("last_login_at");
    });
  }
  if (!(await knex.schema.hasColumn("users", "email_verified_at"))) {
    await knex.schema.alterTable("users", (table) => {
      table.timestamp("email_verified_at");
    });
  }
  if (!(await knex.schema.hasColumn("users", "is_admin"))) {
    await knex.schema.alterTable("users", (table) => {
      table.boolean("is_admin").notNullable().defaultTo(false);
    });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // No-op rollback to avoid accidental destructive schema changes
}
