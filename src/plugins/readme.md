# Plugins Directory

## Overview

This directory contains Fastify plugins that extend the server's functionality through the plugin system. Plugins in this project follow the Fastify plugin pattern and are used to add hooks, decorators, and middleware that operate across multiple routes.

## Available Plugins

### response-formatter.plugin.ts

A plugin that standardizes API responses by ensuring all responses follow a consistent format structure:

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

This plugin uses a `onSend` hook to intercept and transform responses before they're sent to the client, ensuring format consistency across all endpoints.

## Creating New Plugins

To add a new plugin to the system:

1. Create a new file in this directory with the `.plugin.ts` naming convention
2. Use the Fastify plugin pattern with `fastify-plugin`
3. Export your plugin as default

Example template:

```typescript
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const yourPluginName: FastifyPluginAsync = async (fastify, options) => {
  // Plugin implementation
  // Add hooks, decorators, or middleware

  fastify.addHook("onRequest", async (request, reply) => {
    // Do something with every request
  });

  // Or add decorators to fastify
  fastify.decorate("utilityName", (param: string) => {
    // Implementation
    return `processed-${param}`;
  });
};

export default fp(yourPluginName);
```

## Registering Plugins

Plugins should be registered in the main application file (`src/index.ts` or app setup) using:

```typescript
await server.register(import("./plugins/your-plugin.plugin"));
```

## Best Practices

1. **Use fastify-plugin**: Always wrap your plugin with `fp()` to ensure decorators and hooks are available to the parent scope
2. **Single Responsibility**: Each plugin should have a clear, focused purpose
3. **Error Handling**: Include proper error handling within your plugins
4. **Logging**: Use the application logger for important operations
5. **Plugin Options**: Accept configuration options for flexibility

## Plugin Development Guidelines

When developing plugins for this application:

- Plugin files should be named using the pattern: `[name].plugin.ts`
- Include JSDoc comments explaining the plugin's purpose and usage
- Use TypeScript interfaces for plugin options
- Maintain backward compatibility when modifying existing plugins

## Testing Plugins

Plugins should be tested in isolation using Fastify's test utilities:

```typescript
import Fastify from "fastify";
import yourPlugin from "../src/plugins/your-plugin.plugin";

describe("Your Plugin", () => {
  test("should add expected functionality", async () => {
    const fastify = Fastify();
    await fastify.register(yourPlugin);

    // Test plugin behavior
    expect(fastify.someDecorator).toBeDefined();
  });
});
```
