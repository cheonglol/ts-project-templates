# Database Module

This module manages PostgreSQL database connections, migrations, and schema for the application.

## Structure

```
database/
├── README.md                    # This file
├── database-utils.ts           # Database utility functions
├── migrate.ts                  # Migration management utilities
├── migrations/                 # SQL migration files
│   ├── 001_create_migrations_table.sql
│   ├── 002_create_users_table.sql
│   └── 003_add_user_profile_fields.sql
└── sql/
    └── base-schema.sql         # Complete schema documentation
```

## Migration System

The migration system automatically applies database schema changes when the application starts.

### Migration Files

Migrations are applied in alphabetical order based on filename:

1. **001_create_migrations_table.sql** - Creates the migrations tracking table
2. **002_create_users_table.sql** - Creates the main users table with core fields
3. **003_add_user_profile_fields.sql** - Adds extended profile fields to users table

### How It Works

1. On application startup, the database manager scans the `migrations/` directory
2. It compares found files against the `migrations` table in the database
3. Any new migrations are applied in alphabetical order
4. Each migration is recorded with a checksum to prevent re-application

### Users Table Schema

The users table includes:

#### Core Fields

- `id` - Primary key (SERIAL)
- `email` - Unique user email (VARCHAR(255))
- `name` - User's display name (VARCHAR(255))
- `status` - User status: active, inactive, suspended, pending (VARCHAR(50))

#### Timestamps

- `created_at` - When user was created (TIMESTAMP)
- `updated_at` - Last update time (TIMESTAMP, auto-updated)
- `deleted_at` - Soft delete timestamp (TIMESTAMP, nullable)

#### Extended Profile Fields

- `first_name`, `last_name` - Separate name components (VARCHAR(100))
- `phone` - Phone number (VARCHAR(20))
- `avatar_url` - Profile picture URL (TEXT)
- `bio` - User biography (TEXT)
- `timezone` - User's timezone (VARCHAR(50), default: UTC)
- `locale` - User's locale (VARCHAR(10), default: en-US)
- `last_login_at` - Last login timestamp (TIMESTAMP)
- `email_verified_at` - Email verification timestamp (TIMESTAMP)
- `is_admin` - Admin flag (BOOLEAN, default: false)

### Constraints and Validation

- Email format validation (regex pattern)
- Name length validation (2-255 characters)
- Valid status values enforced
- Phone number format validation
- Timezone and locale format validation

### Indexes

Performance indexes on:

- `email` (unique)
- `status`, `name`, `created_at`
- `deleted_at` (for soft delete queries)
- Composite indexes for common query patterns
- Profile field indexes for search functionality

### Triggers

- **Auto-update timestamps**: `updated_at` is automatically updated on any row change
- **Full name generation**: `name` is automatically computed from `first_name` + `last_name` when those fields are updated

## Usage with Repository Pattern

The database integrates seamlessly with the repository pattern:

```typescript
import { createPostgresUserRepository } from "../class/repository/postgres-user.repository";

const userRepo = createPostgresUserRepository();

// Basic operations work with core fields
const user = await userRepo.create({
  email: "user@example.com",
  name: "John Doe",
  status: "active",
});

// Extended profile fields are optional
const profileUser = await userRepo.create({
  email: "profile@example.com",
  first_name: "Jane",
  last_name: "Smith",
  phone: "+1234567890",
  timezone: "America/New_York",
  is_admin: true,
});
```

## Development

### Adding New Migrations

1. Create a new SQL file with format: `XXX_description.sql` (where XXX is the next number)
2. Place it in the `migrations/` directory
3. The migration will be automatically applied on next application start
4. Update `base-schema.sql` to reflect the complete schema

### Testing

All database operations are covered by tests in:

- `src/tests/repository/` - Repository layer tests
- `src/tests/integration/` - Full-stack integration tests

The test suite uses mocked database connections to ensure fast, reliable testing without requiring a real database.
