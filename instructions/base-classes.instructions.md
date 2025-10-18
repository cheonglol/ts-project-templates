# Base Classes Instructions

This document provides comprehensive instructions for using the base classes and repository pattern architecture in your TypeScript project with PostgreSQL integration.

## Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Routes    │───▶│ Controllers │───▶│  Services   │───▶│Repositories │───▶│  Database   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                    │                    │                    │              │
      │                    │                    │                    │              │
   Routing            Response           Business           Data            PostgreSQL
  Definition          Handling           Logic            Access             Database

```

## File Structure

```
src/
├── class/
│   ├── base/                           # Base Classes (Foundation)
│   │   ├── base-repository.class.ts    # Generic repository pattern
│   │   ├── base-service.class.ts       # Business logic base
│   │   └── base-controller.class.ts    # HTTP request handling base
│   ├── common/
│   │   └── errors.class.ts            # Error handling classes
│   ├── repository/                     # Concrete Repositories
│   │   └── postgres-user.repository.ts # PostgreSQL-specific user repo
│   └── services/                      # Services (Business Logic)
│       └── postgres-user.service.ts   # User business logic
├── controllers/                        # Controllers (HTTP Layer)
│   └── user.controller.example.ts     # User HTTP endpoints
├── database/                          # Database Module
│   ├── migrations/                    # SQL migration files
│   │   ├── 001_create_migrations_table.sql
│   │   ├── 002_create_users_table.sql
│   │   └── 003_add_user_profile_fields.sql
│   └── sql/
│       └── base-schema.sql           # Complete schema documentation
├── shared/                            # Shared Modules
│   ├── pgdb-manager.module.ts        # PostgreSQL connection manager
│   └── postgres-repository-adapter.ts # Bridge: connection ↔ repository
└── routes/                            # Route Definitions
    └── user.routes.ts                 # User route definitions
```

## Base Classes (Foundation Layer)

### 1. BaseRepository (`src/class/base/base-repository.class.ts`)

**Purpose**: Provides generic, database-agnostic CRUD operations.

**Key Features**:

- Type-safe CRUD operations
- Built-in pagination
- Soft delete support
- Automatic timestamps
- Transaction support
- Error handling with logging

**Configuration**:

```typescript
interface RepositoryConfig {
  tableName: string; // Database table name
  primaryKey?: string; // Primary key field (default: 'id')
  timestamps?: boolean; // Auto-manage created_at/updated_at (default: true)
  softDelete?: boolean; // Enable soft delete with deleted_at (default: false)
}
```

### 2. BaseService (`src/class/base/base-service.class.ts`)

**Purpose**: Provides business logic layer above repositories.

**Key Features**:

- Error handling and logging
- Consistent service interface
- Repository abstraction

### 3. BaseController (`src/class/base/base-controller.class.ts`)

**Purpose**: Handles HTTP requests and responses.

**Key Features**:

- Standardized response formatting
- Error handling
- CRUD operations with validation
- Pagination support

## Repository Layer

### Creating a Repository

**Step 1**: Define your entity interface

```typescript
export interface User extends Record<string, unknown> {
  id: number;
  email: string;
  name: string;
  status?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;

  // Extended profile fields (optional for backward compatibility)
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  timezone?: string;
  locale?: string;
  last_login_at?: Date;
  email_verified_at?: Date;
  is_admin?: boolean;
}
```

**Step 2**: Create repository class

```typescript
export class PostgresUserRepository extends BaseRepository<User> {
  constructor() {
    const pgAdapter = createPostgresAdapter();
    super(pgAdapter, {
      tableName: "users",
      primaryKey: "id",
      timestamps: true,
      softDelete: true,
    });
  }

  // Add custom methods
  async findByEmail(email: string): Promise<User | null> {
    const sql = this.buildSelectSql() + " AND email = $1";
    return await this.queryOne<User>(sql, [email]);
  }
}
```

## Service Layer

### Creating a Service

**Step 1**: Extend BaseService

```typescript
export class PostgresUserService extends BaseService<User> {
  constructor(private userRepository: PostgresUserRepository) {
    super();
  }

  protected getRepository(): PostgresUserRepository {
    return this.userRepository;
  }

  // Add business logic methods
  async createUser(userData: Partial<User>): Promise<User> {
    // Validation logic
    if (!userData.email || !userData.name) {
      throw new ValidationError({
        message: "Email and name are required",
        errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      });
    }

    // Business logic (e.g., check for duplicates)
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new ValidationError({
        message: "User already exists",
        errorCode: ErrorCode.RESOURCE_ALREADY_EXISTS,
      });
    }

    return await this.create(userData);
  }
}
```

## Controller Layer

### Creating a Controller

**Option A: Extend CrudController (Recommended**

```typescript
export class UserController extends CrudController<User> {
  private userService: PostgresUserService;

  // Required validation schemas
  protected createSchema = z.object({
    email: z.string().email(),
    name: z.string().min(2),
    status: z.enum(["active", "inactive"]).optional(),
  }) as z.ZodSchema<User>;

  protected updateSchema = z.object({
    email: z.string().email().optional(),
    name: z.string().min(2).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }) as z.ZodSchema<Partial<User>>;

  constructor() {
    super();
    this.userService = createPostgresUserService();
  }

  // Implement required CRUD methods
  protected async getAll(): Promise<User[]> {
    return await this.userService.findAll();
  }

  protected async getById(id: string | number): Promise<User | null> {
    return await this.userService.findById(id);
  }

  protected async create(data: Partial<User>): Promise<User> {
    return await this.userService.createUser(data);
  }

  protected async update(id: string | number, data: Partial<User>): Promise<User | null> {
    return await this.userService.updateUser(id, data);
  }

  protected async delete(id: string | number): Promise<boolean> {
    return await this.userService.delete(id);
  }
}
```

**Option B: Extend BaseController (For Custom Logic)**

```typescript
export class UserController extends BaseController {
  private userService: PostgresUserService;

  constructor() {
    super();
    this.userService = createPostgresUserService();
  }

  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    await this.handleRequest(reply, () => this.userService.findAll(), "Users retrieved successfully");
  }

  async createUser(request: FastifyRequest, reply: FastifyReply) {
    const userData = request.body as Partial<User>;
    await this.handleRequest(reply, () => this.userService.createUser(userData), "User created successfully");
  }
}
```

## Route Layer

### Creating Routes

**Routes should connect to controllers, NOT directly to services or repositories.**

```typescript
// src/routes/user.routes.ts
import { FastifyInstance } from "fastify";
import { createUserController } from "../controllers/user.controller.example";

export async function userRoutes(fastify: FastifyInstance) {
  const userController = createUserController();

  // CRUD Routes (using CrudController)
  fastify.get("/users", userController.handleGetAll.bind(userController));
  fastify.get("/users/:id", userController.handleGetById.bind(userController));
  fastify.post("/users", userController.handleCreate.bind(userController));
  fastify.put("/users/:id", userController.handleUpdate.bind(userController));
  fastify.delete("/users/:id", userController.handleDelete.bind(userController));

  // Custom routes (if needed)
  fastify.get("/users/search/:pattern", userController.searchUsers.bind(userController));
  fastify.patch("/users/bulk-status", userController.bulkUpdateStatus.bind(userController));
}
```

## Database Integration

### Application Startup Integration

The database manager is now integrated into the main application startup sequence in `src/index.ts`:

```typescript
import DBConnection from "./shared/pgdb-manager.module";

async function startServer(): Promise<void> {
  // Initialize database connection before starting the server
  try {
    logger.info("Initializing database connection...", startServer.name, LoggingTags.STARTUP);
    await DBConnection.initialize();
    logger.info("Database connection initialized successfully", startServer.name, LoggingTags.STARTUP);
  } catch (error) {
    logger.error(`Failed to initialize database: ${error}`, startServer.name, LoggingTags.ERROR);
    process.exit(1);
  }

  // ... rest of server setup
}
```

### PostgreSQL Connection & Migration System

Your PostgreSQL connection manager (`src/shared/pgdb-manager.module.ts`) now includes:

- **Automatic Migration System**: Applies database schema changes on startup
- **Migration Tracking**: Tracks applied migrations with checksums
- **Connection Pooling**: Manages PostgreSQL connection pool
- **Graceful Shutdown**: Properly closes connections on application shutdown

The `postgres-repository-adapter.ts` bridges the connection with the repository pattern:

```typescript
// This happens automatically - no code changes needed
DBConnection → PostgresAdapter → BaseRepository → YourRepository
```

### Database Schema & Migrations

The database module (`src/database/`) contains:

- **Migration Files**: Incremental SQL schema changes
  - `001_create_migrations_table.sql` - Migration tracking table
  - `002_create_users_table.sql` - Core users table with indexes and constraints
  - `003_add_user_profile_fields.sql` - Extended profile fields
- **Schema Documentation**: Complete schema reference in `base-schema.sql`

### Enhanced Health Checks

Health check endpoints now include database connectivity monitoring:

- **`GET /healthcheck/`** - Basic health check
- **`GET /healthcheck/detailed`** - System metrics + database status
- **`GET /healthcheck/database`** - Dedicated database connectivity check

```typescript
// Health check example
{
  "success": true,
  "message": "Health check details",
  "data": {
    "status": "UP",
    "uptime": "120.45 seconds",
    "memory": {
      "rss": "45 MB",
      "heapTotal": "20 MB",
      "heapUsed": "15 MB"
    },
    "database": {
      "status": "UP"
    }
  }
}
```

### Database Schema Requirements

The users table now includes extended profile fields:

```sql
-- Complete users table schema
CREATE TABLE users (
  -- Core fields
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP NULL, -- For soft delete

  -- Extended profile fields
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  bio TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  locale VARCHAR(10) DEFAULT 'en-US',
  last_login_at TIMESTAMP,
  email_verified_at TIMESTAMP,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL
);

-- Performance indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_name ON users(name);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Composite indexes for common queries
CREATE INDEX idx_users_active ON users(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status_active ON users(status, created_at) WHERE deleted_at IS NULL;

-- Data integrity constraints
ALTER TABLE users ADD CONSTRAINT chk_users_email_format
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE users ADD CONSTRAINT chk_users_status_valid
  CHECK (status IN ('active', 'inactive', 'suspended', 'pending'));

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate name from first_name + last_name
CREATE OR REPLACE FUNCTION update_full_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
        NEW.name = TRIM(CONCAT(COALESCE(NEW.first_name, ''), ' ', COALESCE(NEW.last_name, '')));
        IF NEW.name = '' OR NEW.name IS NULL THEN
            NEW.name = COALESCE(NEW.first_name, NEW.last_name, 'Unknown User');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_users_update_full_name
    BEFORE INSERT OR UPDATE OF first_name, last_name ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_full_name();
```

## Development Workflow

### 1. Creating a New Entity

1. **Create Database Migration** (in `src/database/migrations/`)
2. **Define Entity Interface** (with all fields including optional extended ones)
3. **Create Repository** (extend BaseRepository in `src/class/repository/`)
4. **Create Service** (extend BaseService in `src/class/services/`)
5. **Create Controller** (extend CrudController or BaseController in `src/controllers/`)
6. **Create Routes** (connect to controller in `src/routes/`)
7. **Register Routes** in your main app (`src/index.ts`)

### 2. Migration System Workflow

**Creating a New Migration**:

1. Create file: `src/database/migrations/004_your_change.sql`
2. Write SQL changes (CREATE, ALTER, etc.)
3. Restart application - migration applies automatically
4. Update `src/database/sql/base-schema.sql` to reflect complete schema

**Migration Example**:

```sql
-- Migration: 004_add_user_preferences.sql
-- Description: Add user preference fields

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_users_theme ON users(theme);

ALTER TABLE users ADD CONSTRAINT chk_users_theme_valid
  CHECK (theme IN ('light', 'dark', 'auto'));
```

### 3. Application Startup Sequence

The application now follows this startup order:

1. **Environment Validation** - Check required environment variables
2. **Database Connection** - Initialize PostgreSQL and apply migrations
3. **Server Creation** - Create Fastify server instance
4. **Route Registration** - Register all HTTP routes
5. **Server Start** - Begin listening for requests
6. **Background Services** - Start cron jobs and other services

### 4. Graceful Shutdown

The application handles shutdown signals (SIGTERM, SIGINT) gracefully:

1. **Stop Background Services** - Stop all cron jobs
2. **Close HTTP Server** - Stop accepting new requests
3. **Close Database Connections** - Clean up database connections
4. **Exit Process** - Exit with appropriate code

### 2. Example: Adding a Product Entity

```typescript
// 1. Entity Interface
export interface Product extends Record<string, unknown> {
  id: number;
  name: string;
  price: number;
  category_id: number;
  created_at: Date;
  updated_at: Date;
}

// 2. Repository
export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    const pgAdapter = createPostgresAdapter();
    super(pgAdapter, {
      tableName: "products",
      primaryKey: "id",
      timestamps: true,
      softDelete: false,
    });
  }

  async findByCategory(categoryId: number): Promise<Product[]> {
    const sql = this.buildSelectSql() + " AND category_id = $1";
    return await this.query<Product>(sql, [categoryId]);
  }
}

// 3. Service
export class ProductService extends BaseService<Product> {
  constructor(private productRepository: ProductRepository) {
    super();
  }

  protected getRepository(): ProductRepository {
    return this.productRepository;
  }

  async createProduct(productData: Partial<Product>): Promise<Product> {
    // Add business logic here
    return await this.create(productData);
  }
}

// 4. Controller
export class ProductController extends CrudController<Product> {
  // Implementation similar to UserController
}

// 5. Routes
export async function productRoutes(fastify: FastifyInstance) {
  const productController = createProductController();

  fastify.get("/products", productController.handleGetAll.bind(productController));
  fastify.post("/products", productController.handleCreate.bind(productController));
  // ... other routes
}
```

## Testing Strategy

### Repository Testing

Tests use mocked database connections for fast, reliable testing:

```typescript
// src/tests/repository/postgres-user-repository.test.ts
import { PostgresUserRepository, User } from "../../class/repository/postgres-user.repository";
import { DatabaseConnection } from "../../class/base/base-repository.class";

class MockPostgresConnection implements DatabaseConnection {
  private users: User[] = [];
  // Mock implementation for query, queryOne, execute, transaction methods
}

describe("PostgresUserRepository", () => {
  let mockConnection: MockPostgresConnection;
  let repository: PostgresUserRepository;

  beforeEach(() => {
    mockConnection = new MockPostgresConnection();
    // Mock the adapter to return our mock connection
    repository = new PostgresUserRepository();
  });

  it("should create user with extended fields", async () => {
    const userData = {
      email: "test@example.com",
      name: "Test User",
      first_name: "Test",
      last_name: "User",
      timezone: "America/New_York",
    };

    const user = await repository.create(userData);

    expect(user.email).toBe("test@example.com");
    expect(user.first_name).toBe("Test");
    expect(user.timezone).toBe("America/New_York");
  });
});
```

### Service Testing

Service tests use mocked repositories for isolated business logic testing:

```typescript
// src/tests/services/postgres-user-service.test.ts
import { PostgresUserService } from "../../class/services/postgres-user.service";
import { PostgresUserRepository } from "../../class/repository/postgres-user.repository";

jest.mock("../../class/repository/postgres-user.repository");

describe("PostgresUserService", () => {
  let mockRepository: jest.Mocked<PostgresUserRepository>;
  let service: PostgresUserService;

  beforeEach(() => {
    mockRepository = jest.mocked(new PostgresUserRepository());
    service = new PostgresUserService(mockRepository);
  });

  it("should validate email before creating user", async () => {
    await expect(
      service.createUser({ name: "Test" }) // Missing email
    ).rejects.toThrow("Email and name are required");

    expect(mockRepository.create).not.toHaveBeenCalled();
  });
});
```

### Controller Testing

Controller tests verify HTTP request/response handling:

```typescript
// src/tests/controller/user.controller.test.ts
import { UserController } from "../../controllers/user.controller.example";
import { PostgresUserService } from "../../class/services/postgres-user.service";

jest.mock("../../class/services/postgres-user.service");

describe("UserController", () => {
  let mockService: jest.Mocked<PostgresUserService>;
  let controller: UserController;
  let mockRequest: FastifyRequest;
  let mockReply: FastifyReply;

  beforeEach(() => {
    mockService = jest.mocked(new PostgresUserService({} as any));
    controller = new UserController();
    // Setup mock request/reply objects
  });

  it("should create user and return success response", async () => {
    const userData = { email: "test@example.com", name: "Test User" };
    const createdUser = { id: 1, ...userData, created_at: new Date(), updated_at: new Date() };

    mockService.createUser.mockResolvedValue(createdUser);
    mockRequest.body = userData;

    await controller.createUser(mockRequest, mockReply);

    expect(mockService.createUser).toHaveBeenCalledWith(userData);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: true,
      data: { user: createdUser },
      message: "User created successfully",
    });
  });
});
```

### Integration Testing

Integration tests verify the complete flow from controller to database:

```typescript
// src/tests/integration/repository-pattern.integration.test.ts
describe("Repository Pattern Integration", () => {
  it("should handle complete user creation flow", async () => {
    // Test Controller → Service → Repository flow
    // Using service-level mocks for cleaner architecture testing
  });
});
```

### Test Coverage Areas

- ✅ **Repository Layer**: CRUD operations, custom queries, data transformation
- ✅ **Service Layer**: Business logic, validation, error handling
- ✅ **Controller Layer**: HTTP handling, request validation, response formatting
- ✅ **Integration**: End-to-end flow verification
- ✅ **Database Health**: Connection status and migration tracking

## Best Practices

### 1. Layer Separation

- **Don't**: Call repositories directly from controllers
- **Do**: Controllers → Services → Repositories

### 2. Error Handling

- Use the built-in error classes: `ValidationError`, `DatabaseError`, etc.
- Let errors bubble up through the layers
- Handle errors at the controller level

### 3. Validation

- Use Zod schemas in controllers for request validation
- Add business logic validation in services
- Keep database constraints in the database

### 4. Transactions

```typescript
// Use transactions for complex operations
async transferBetweenUsers(fromId: number, toId: number, amount: number): Promise<void> {
  await this.userRepository.transaction(async (connection) => {
    const transactionRepo = new UserRepository(connection);

    await transactionRepo.decreaseBalance(fromId, amount);
    await transactionRepo.increaseBalance(toId, amount);
  });
}
```

### 5. Configuration

- Repository configurations should be explicit and documented
- Use environment variables for database connection settings
- Keep business logic in services, not repositories

## Migration from Existing Code

### Step 1: Identify Current Data Access

- Find existing database queries
- Identify business logic mixed with data access

### Step 2: Create Repositories

- Group related queries into repository classes
- Move pure data access logic to repositories

### Step 3: Create Services

- Extract business logic into service classes
- Add validation and error handling

### Step 4: Update Controllers

- Make controllers use services instead of direct database access
- Standardize response formats

### Step 5: Create Routes

- Ensure routes only call controller methods
- Remove any direct service/repository calls from routes

## Troubleshooting

### Common Issues

**1. TypeScript Errors with Schemas**

```typescript
// Wrong
const schema = z.object({ name: z.string() });

// Correct
const schema = z.object({
  id: z.number().optional(),
  name: z.string(),
  // ... all entity fields
}) as z.ZodSchema<User>;
```

**2. Repository Not Finding Records**

- Check table name configuration
- Verify soft delete settings
- Check database connection

**3. Controller Binding Issues**

```typescript
// Wrong
fastify.get("/users", userController.getUsers);

// Correct
fastify.get("/users", userController.getUsers.bind(userController));
```

## Key Files Reference

| File                             | Purpose                   | Extends        | Contains                        |
| -------------------------------- | ------------------------- | -------------- | ------------------------------- |
| `base-repository.class.ts`       | Data access foundation    | -              | CRUD, pagination, transactions  |
| `base-service.class.ts`          | Business logic foundation | -              | Error handling, logging         |
| `base-controller.class.ts`       | HTTP handling foundation  | -              | Response formatting, validation |
| `postgres-user.repository.ts`    | User data access          | BaseRepository | User-specific queries           |
| `postgres-user.service.ts`       | User business logic       | BaseService    | User validation, operations     |
| `user.controller.example.ts`     | User HTTP endpoints       | CrudController | Request/response handling       |
| `postgres-repository-adapter.ts` | DB connection bridge      | -              | PostgreSQL integration          |
| `pgdb-manager.module.ts`         | Database connection       | -              | Connection pool, migrations     |
| `healthcheck.controller.ts`      | Health monitoring         | BaseController | Database connectivity checks    |

## Recent Enhancements

### Database Integration

- ✅ **Automatic Migration System**: Schema changes applied on startup
- ✅ **Connection Lifecycle**: Proper initialization and graceful shutdown
- ✅ **Health Monitoring**: Database connectivity health checks
- ✅ **Extended User Schema**: Profile fields with backward compatibility

### Application Architecture

- ✅ **Startup Sequence**: Database-first initialization order
- ✅ **Error Handling**: Comprehensive error propagation through layers
- ✅ **Signal Handling**: Graceful shutdown on SIGTERM/SIGINT
- ✅ **Test Coverage**: Complete test suite for all architectural layers

### Developer Experience

- ✅ **Type Safety**: Full TypeScript coverage with proper interfaces
- ✅ **Documentation**: Comprehensive architecture and usage instructions
- ✅ **Migration Tracking**: Checksum-based migration system
- ✅ **Performance**: Optimized database indexes and query patterns

## Summary

**Architecture Flow**: Routes → Controllers → Services → Repositories → Database

**Key Principles**:

1. **Separation of Concerns**: Each layer has a specific responsibility
2. **Type Safety**: Full TypeScript support throughout
3. **Testability**: Easy to mock and test each layer
4. **Consistency**: Standardized patterns across all entities
5. **Maintainability**: Clear structure and documentation

**Remember**: Routes should always go through controllers, controllers should use services, and services should use repositories. Never skip layers in the architecture!
