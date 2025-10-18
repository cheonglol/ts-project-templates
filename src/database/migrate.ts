/**
 * Database Migration Script (TypeScript)
 *
 * Manually run database migrations or check migration status
 * Usage: npx ts-node src/database/migrate.ts [command]
 *
 * Commands:
 *   status    - Show migration status
 *   migrate   - Apply pending migrations
 *   health    - Check database health
 *   reset     - Reset database (dangerous!)
 */

import DatabaseUtils from "./database-utils";
import DBConnection from "../shared/pgdb-manager.module";

async function runMigrationCommand(): Promise<void> {
  const command = process.argv[2] || "status";

  try {
    console.log(`\n🗄️  Database Migration Tool`);
    console.log("=".repeat(50));

    switch (command) {
      case "status": {
        console.log("📊 Migration Status:");
        const migrations = await DatabaseUtils.getMigrationStatus();
        if (migrations.length === 0) {
          console.log("   No migrations found or migrations table does not exist");
        } else {
          migrations.forEach((migration) => {
            const period = migration.applied_period === "recent" ? "🟢" : migration.applied_period === "week" ? "🟡" : "🔵";
            console.log(`   ${period} ${migration.filename} (${migration.applied_at.toISOString()})`);
          });
        }
        break;
      }

      case "migrate": {
        console.log("🚀 Applying migrations...");
        console.log("   Migrations are automatically applied during database initialization");
        console.log("   Restart your application to apply new migrations");
        break;
      }

      case "health": {
        console.log("🔍 Database Health Check:");
        const health = await DatabaseUtils.getConnectionHealth();
        console.log(`   Connected: ${health.connected ? "✅" : "❌"}`);
        console.log(`   Timestamp: ${health.timestamp.toISOString()}`);
        console.log(`   Migrations: ${health.migrations_count}`);
        console.log(`   Tables: ${health.tables_count}`);
        break;
      }

      case "reset": {
        console.log("⚠️  DANGER: This will reset the entire database!");
        console.log("   All data will be permanently lost!");

        // Simple confirmation (in production, you'd want better confirmation)
        if (process.argv[3] !== "--confirm") {
          console.log("   Add --confirm flag to proceed with reset");
          process.exit(1);
        }

        await DatabaseUtils.resetDatabase();
        console.log("✅ Database reset completed");
        break;
      }

      default: {
        console.log("❌ Unknown command:", command);
        console.log("\nAvailable commands:");
        console.log("   status  - Show migration status");
        console.log("   migrate - Apply pending migrations");
        console.log("   health  - Check database health");
        console.log("   reset   - Reset database (add --confirm)");
        process.exit(1);
      }
    }

    console.log("\n✅ Command completed successfully");
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await DBConnection.close();
    } catch {
      // Ignore close errors
    }
    process.exit(0);
  }
}

// Run the command
runMigrationCommand().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
