# ts-fastify-backend-template

A robust TypeScript backend template leveraging Fastify, designed for scalable and maintainable service development. This template provides a modular architecture, opinionated project structure, and built-in utilities for error handling, logging, validation, and more.

---

## Key Features

- **TypeScript-first**: All code is written in modern TypeScript for safety and developer experience.
- **Fastify Framework**: Enables high-performance HTTP APIs with plugin-based extensibility.
- **Modular Architecture**: Clear separation of concerns across controllers, services, modules, plugins, and utilities.
- **Decorator-driven Routing**: Supports expressive, class-based controller and route definitions using decorators.
- **Custom Logging System**: Centralized logger with support for log levels, tagged/categorized logs, and multiple output formats.
- **Structured Error Handling**: Application-wide error classes (e.g., validation, authentication, authorization) with consistent formatting.
- **Standardized API Responses**: Plugins ensure all API responses follow a uniform structure for clients.
- **Code Quality Automation**: Includes ESLint, Prettier, Husky, Commitlint, and lint-staged for formatting, linting, and commit hygiene.
- **Extensible Plugin System**: Simple pattern for creating and registering Fastify plugins to add middleware, hooks, or custom logic.
- **Healthcheck & Cron**: Built-in healthcheck endpoints and Cron job service integration.

---

## Project Structure

```
src/
├── class/         # Core base classes
├── common/        # Logging, error classes, utilities
├── constants/     # Enums and constants
├── controller/    # Decorator-driven endpoint handlers
├── decorators/    # Route and controller decorators
├── enums/         # TypeScript enums
├── interfaces/    # Shared TypeScript interfaces
├── middleware/    # Express/Fastify middleware
├── modules/       # Functional modules (env validation, error handling, etc.)
├── plugins/       # Fastify plugin implementations
├── routes/        # Route registration and definitions
└── utils/         # Generic helper utilities
```

Refer to [`docs/backend-architecture.md`](https://github.com/cheonglol/ts-fastify-backend-template/blob/main/docs/backend-architecture.md) for a detailed breakdown.

---

## Getting Started

1. **Clone & Install**

   ```bash
   git clone https://github.com/cheonglol/ts-fastify-backend-template.git
   cd ts-fastify-backend-template
   npm install
   ```

2. **Environment Setup**
   - Copy `.env.example` to `.env` and adjust settings as needed.

3. **Setup Husky (First Time)**

   ```bash
   npm run prepare
   ```

   This will set up Git hooks for code quality checks.

4. **Development**

   ```bash
   npm run dev
   ```

5. **Build & Run**
   ```bash
   npm run build
   npm start
   ```

---

## Architectural Highlights

### Decorator-Based Controllers

Define endpoints in `src/controller` using class decorators for clean and organized route logic. Example:

```typescript
@Controller("/users")
export class UserController extends BaseController {
  @Get("/")
  async getUsers(_req, reply) {
    this.sendSuccess(reply, "Users retrieved", { users: [] });
  }
}
```

Routes are auto-registered at startup.

### Plugin System

Easily extend server functionality through Fastify plugins in `src/plugins/`. All plugins follow a naming and usage convention and can register hooks, decorators, etc. See [`src/plugins/readme.md`](https://github.com/cheonglol/ts-fastify-backend-template/blob/main/src/plugins/readme.md) for details.

### Centralized Error Handling

Use custom error classes (`ApplicationError`, `ValidationError`, etc.) for strong typing and consistent client responses. All errors are formatted and logged with context.

### Logging

A singleton logger supports log levels (DEBUG, INFO, WARN, ERROR), tagged messages, configurable output formats (simple, compact, JSON), and easy integration throughout the codebase.

### Healthcheck & Cron

Healthcheck endpoints are provided out-of-the-box, and a Cron job service is available for scheduled tasks.

---

## Code Quality & Commit Workflow

- Pre-commit hooks (`.husky/`) enforce linting and formatting.
- Commits are checked for build validity and message conventions via Commitlint.
- ESLint and Prettier are preconfigured for style and correctness.

---

## Contributing

- Add new plugins to `src/plugins/` using the `.plugin.ts` suffix.
- Create new controllers in `src/controller/` and decorate them.
- Follow code style and commit conventions enforced by the toolchain.

---

For more details, browse the [source code](https://github.com/cheonglol/ts-fastify-backend-template) and see the [architecture docs](https://github.com/cheonglol/ts-fastify-backend-template/blob/main/docs/backend-architecture.md).
