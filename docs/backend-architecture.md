# JustifyPrint Chatbot Service - Backend Architecture

## 📋 Overview

TypeScript-based modular backend using Fastify with decorator-driven routing, standardized responses, and structured error handling.

---

## 🛠️ Tech Stack

| Category             | Technology                               |
| -------------------- | ---------------------------------------- |
| **Runtime**          | Node.js                                  |
| **Language**         | TypeScript (ES2018 target)               |
| **Server Framework** | Fastify                                  |
| **HTTP Client**      | Axios (wrapped in AxiosClient singleton) |
| **Validation**       | Custom ValidationError system            |
| **Logging**          | Custom tiered Logger implementation      |
| **Code Quality**     | ESLint, Prettier, Husky, Commitlint      |

---

## 📂 Project Structure

```
src/
├── class/                 # Core classes, base implementations
├── constants/             # Enums, constants
├── controller/            # Endpoint handlers with decorators
├── decorators/            # Route/controller decorators
├── enums/                 # TypeScript enumerations
├── interfaces/            # TypeScript interfaces
├── middleware/            # Request/response processors
├── modules/               # Functional modules
├── plugins/               # Fastify plugins
├── routes/                # Route definitions
└── utils/                 # Utility functions
```

---

## 💻 Implementation Guide

### 🎮 Creating Endpoints

1. Create a controller class in `src/controller` with `.controller.ts` suffix
2. Extend `BaseController` and add `@Controller('/path')` decorator
3. Add methods with `@Get`, `@Post`, etc. decorators
4. Routes are auto-registered at startup

```typescript
// Example: src/controller/user.controller.ts
import { Controller, Get, Post } from "../decorators/route.decorators";
import { BaseController } from "../class/base-controller.class";

@Controller("/users")
export class UserController extends BaseController {
  @Get("/")
  async getUsers(_request, reply) {
    // To return success response:
    this.sendSuccess(reply, "Users retrieved", { users: [] });

    // To handle errors:
    // this.sendError(reply, 'Access denied', { reason: 'permissions' }, 403);
  }

  @Post("/")
  async createUser(request, reply) {
    const userData = request.body;
    // Add validation and processing...
    this.sendSuccess(reply, "User created", { userId: "new-id" }, 201);
  }
}

export default new UserController();
```

### 🔧 Creating Services

1. Create a service class in appropriate directory
2. Extend `BaseService<T>` for CRUD operations
3. Implement `getRepository()` method
4. Add custom business logic methods

```typescript
// Example: src/services/user.service.ts
import { BaseService } from "../class/base-service.class";
import { User } from "../interfaces/user.interface";

export class UserService extends BaseService<User> {
  private userRepository: Repository<User>;

  constructor() {
    super();
    // Initialize repository
  }

  protected getRepository(): Repository<User> {
    return this.userRepository;
  }

  // Add custom methods
  async getUserByEmail(email: string): Promise<User | null> {
    // Implementation
  }
}
```

### ⚠️ Error Handling

1. Use specific error classes to throw appropriate errors
2. Add context data to help with debugging
3. Errors are automatically formatted and returned to client

```typescript
// Validation error example
if (!isValid(data)) {
  throw new ValidationError({
    message: "Invalid user data",
    errorCode: ErrorCode.INVALID_FORMAT,
    context: {
      providedFields: Object.keys(data),
      validationErrors: getErrors(data),
    },
  });
}

// Authentication error example
if (!token) {
  throw new AuthenticationError({
    message: "Authentication required",
    context: { endpoint: "getUserData" },
  });
}
```

### 📤 Working with Responses

All endpoint responses should use controller helper methods:

```typescript
// Success response (200 OK by default)
this.sendSuccess(
  reply, // Fastify reply object
  "Operation successful", // Message
  { data: result }, // Optional data
  201 // Optional status code
);

// Error response (400 Bad Request by default)
this.sendError(
  reply, // Fastify reply object
  "Something went wrong", // Error message
  { details: error }, // Optional error details
  403 // Optional status code
);
```

### 🌐 Making HTTP Requests

Use AxiosClient for all external API calls:

```typescript
// GET request with type safety
const response = await AxiosClient.get<UserProfile>("/api/profiles/123");
if (response.success) {
  // TypeScript knows response.payload is UserProfile
  const profile = response.payload;
} else {
  logger.error(`Failed to get profile: ${response.msg}`);
}

// POST request with data
const createResponse = await AxiosClient.post<CreateResponse>("/api/resources", { name: "New Resource", type: "example" }, { headers: { "X-Custom-Header": "value" } });
```

### 📊 Logging Best Practices

```typescript
// Standard log levels with context
logger.debug("Detailed information", functionName, LogTags.DEBUG);
logger.info("Operation completed", functionName, LogTags.SYSTEM);
logger.warn("Concerning situation", functionName, LogTags.WARNING);
logger.error("Something failed", functionName, LogTags.ERROR);

// Structured error logging
logger.error(
  {
    message: "Failed to process request",
    statusCode: 500,
    requestId: req.id,
    errorDetails: error,
  },
  "processRequest",
  LogTags.ERROR
);
```

---

## 🧩 Core Components

### 🎮 Controllers

```typescript
@Controller("/health")
export class HealthcheckController extends BaseController {
  @Get("/ping")
  async ping(_request: FastifyRequest, reply: FastifyReply) {
    this.sendSuccess(reply, "Service is healthy", {
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 🔧 Services

Abstract base service with Repository pattern:

```typescript
export abstract class BaseService<T> {
  protected abstract getRepository(): Repository<T>;

  async findAll(): Promise<T[]> {
    try {
      return await this.getRepository().findAll();
    } catch (error) {
      this.handleError(error, "Error retrieving all items");
      return [];
    }
  }

  // Other CRUD methods...
}
```

### 📤 Response Structure

```typescript
{
  "content": string,        // Message describing the response
  "timestamp": ISO8601,     // Response generation time
  "status": "success"|"error"|"pending",
  "metadata": {             // Additional data object
    // Variable properties
  }
}
```

### ⚠️ Error Hierarchy

```
ApplicationError (base)
├── ValidationError
├── AuthenticationError
├── AuthorizationError
├── ResourceNotFoundError
├── ExternalServiceError
└── DatabaseError
```

Error properties:

- `name`: Error type identifier
- `statusCode`: HTTP status code
- `category`: Error classification
- `errorCode`: Application-specific code
- `isOperational`: Expected vs unexpected
- `context`: Debugging information

---

## 🏛️ Key Architectural Features

### 🔄 Decorators

| Decorator           | Purpose                             |
| ------------------- | ----------------------------------- |
| `@Controller(path)` | Class decorator defining base route |
| `@Get(path)`        | GET endpoint at specified path      |
| `@Post(path)`       | POST endpoint at specified path     |
| `@Put(path)`        | PUT endpoint at specified path      |
| `@Delete(path)`     | DELETE endpoint at specified path   |
| `@Patch(path)`      | PATCH endpoint at specified path    |

### 🔄 Middleware Pipeline

1. **Request Logger**: Logs method, URL, headers with timing data
2. **Error Handler**: Transforms errors to standardized responses with appropriate status codes
3. **Response Formatter**: Ensures response format consistency via Fastify plugin

### 🔄 Auto Route Registration

`RouteRegistrar` discovers and registers controllers using reflection:

```typescript
static async registerControllers(fastify: FastifyInstance, controllersDir: string): Promise<void> {
  // Discover controller files (*.controller.ts)
  // Extract metadata with reflect-metadata
  // Register routes with Fastify
}
```

### 📝 TypeScript Configuration

Critical compiler options:

```json
{
  "strict": true,
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "noImplicitAny": true,
  "strictNullChecks": true
}
```

---

## 🧰 Design Patterns

| Pattern        | Implementation         | Purpose                           |
| -------------- | ---------------------- | --------------------------------- |
| **Singleton**  | Logger, AxiosClient    | Single instance, global access    |
| **Decorator**  | Route decorators       | Declarative endpoint definition   |
| **Repository** | BaseService interface  | Data access abstraction           |
| **Factory**    | Error creation methods | Standardized error objects        |
| **Middleware** | Request pipeline       | Processing request/response chain |

---

## 🚨 Error Handling

1. **Categorization**: Errors grouped by category (VALIDATION, AUTHENTICATION, etc.)
2. **Context**: Errors carry payload with debugging context
3. **Operational vs Programmer**: Distinguished by `isOperational` flag
4. **Centralized Handling**: Global handler in `errorHandler.middleware.ts`
5. **Status Mapping**: Error types map to HTTP status codes

---

## 📊 Logging System

```typescript
// Four severity levels
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Four output formats
enum LogOutputFormat {
  SIMPLE,
  COMPACT,
  DETAILED,
  JSON,
}

// Usage
logger.info("Service started", "startService", LogTags.STARTUP);
```

---

## 🌐 HTTP Client

AxiosClient provides typed HTTP methods with standardized responses:

```typescript
const response = await AxiosClient.get<UserData>("/users/1");
// Response type: IStandardResponseBody<UserData>
```

**Features:**

- ✅ Request tracking/deduplication
- ✅ Consistent error mapping
- ✅ Automatic logging
- ✅ Response transformation

---

## 🔌 Extension Points

### 🆕 New Controller

```typescript
@Controller("/users")
export class UserController extends BaseController {
  @Get("/")
  async getAllUsers(request: FastifyRequest, reply: FastifyReply) {
    // Implementation
  }
}
```

### 🆕 New Service

```typescript
export class UserService extends BaseService<User> {
  protected getRepository(): Repository<User> {
    return this.userRepository;
  }

  // Custom methods...
}
```

### 🆕 Custom Error

```typescript
export class BusinessRuleError extends ApplicationError {
  constructor({ message, context = {} }) {
    super({
      name: "BusinessRuleError",
      message,
      statusCode: HttpStatusCode.UNPROCESSABLE_ENTITY,
      category: ErrorCategory.VALIDATION,
      errorCode: ErrorCode.BUSINESS_RULE_VIOLATION,
      context,
    });
  }
}
```

---

## 🧪 Testing Guide

### Unit Test Example

```typescript
// Example: Testing a controller method
describe("UserController", () => {
  test("getUsers returns user list", async () => {
    // Setup
    const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const controller = new UserController();

    // Execute
    await controller.getUsers({} as FastifyRequest, mockReply as unknown as FastifyReply);

    // Assert
    expect(mockReply.status).toHaveBeenCalledWith(200);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
      })
    );
  });
});
```

---

## 🔒 Security Implementation

- 🛡️ Input validation via ValidationError
- 🛡️ HTTP headers set via middleware
- 🛡️ Controlled error exposure
- 🛡️ Authenticated HTTP client defaults
- 🛡️ Environment-based security settings

---

## 🚀 Development Workflow

1. Create feature branch from main
2. Implement changes following architecture patterns
3. Run `npm run build` to verify compilation
4. Submit PR with conventional commit message format

### Common Commands

```bash
# Start development server
npm run dev

# Build project
npm run build

# Lint and format code
npx lint-staged
```

### Quick Reference

### Validation Patterns

```typescript
// Required parameters
if (!userId)
  throw new ValidationError({
    message: "User ID is required",
  });

// Type validation
if (typeof limit !== "number")
  throw new ValidationError({
    message: "Limit must be a number",
  });

// Complex validation
const errors = validateUserData(userData);
if (errors.length > 0)
  throw new ValidationError({
    message: "Invalid user data",
    context: { errors },
  });
```

### Common HTTP Status Codes

| Code | When to Use                                    |
| ---- | ---------------------------------------------- |
| 200  | Successful GET, PUT with complete response     |
| 201  | Successful resource creation (POST)            |
| 204  | Successful operation with no content to return |
| 400  | Client error (ValidationError)                 |
| 401  | Authentication required (AuthenticationError)  |
| 403  | Permission denied (AuthorizationError)         |
| 404  | Resource not found (ResourceNotFoundError)     |
| 500  | Server error (unexpected errors)               |

### Decorator Cheat Sheet

| Decorator              | Purpose          | Example                 |
| ---------------------- | ---------------- | ----------------------- |
| `@Controller('/path')` | Define base path | `@Controller('/users')` |
| `@Get('/path')`        | GET endpoint     | `@Get('/:id')`          |
| `@Post('/path')`       | POST endpoint    | `@Post('/')`            |
| `@Put('/path')`        | PUT endpoint     | `@Put('/:id')`          |
| `@Delete('/path')`     | DELETE endpoint  | `@Delete('/:id')`       |
| `@Patch('/path')`      | PATCH endpoint   | `@Patch('/:id/status')` |
