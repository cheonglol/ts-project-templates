/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";

// Metadata keys for route reflection
const CONTROLLER_META_KEY = "controller:base_path";
const ROUTES_META_KEY = "controller:routes";

// Route definition interface
export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  methodName: string | symbol;
}

/**
 * Controller decorator to define base path
 */
export function Controller(basePath: string): ClassDecorator {
  return (target: any): void => {
    Reflect.defineMetadata(CONTROLLER_META_KEY, basePath, target);

    // Ensure routes metadata is initialized
    if (!Reflect.hasMetadata(ROUTES_META_KEY, target)) {
      Reflect.defineMetadata(ROUTES_META_KEY, [], target);
    }
  };
}

/**
 * Checks if a value is a constructor function
 */
export function isConstructor(obj: unknown): boolean {
  return typeof obj === "function" && obj.prototype && obj.prototype.constructor === obj && Object.getOwnPropertyNames(obj.prototype).length > 1;
}

/**
 * Method decorator factory for HTTP methods
 */
function createMethodDecorator(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH") {
  return (path: string): MethodDecorator => {
    return (target: object, propertyKey: string | symbol) => {
      // Get existing routes or initialize empty array
      const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_META_KEY, target.constructor) || [];

      // Add new route
      routes.push({
        method,
        path,
        methodName: propertyKey,
      });

      // Update metadata
      Reflect.defineMetadata(ROUTES_META_KEY, routes, target.constructor);
    };
  };
}

// HTTP method decorators
export const Get = createMethodDecorator("GET");
export const Post = createMethodDecorator("POST");
export const Put = createMethodDecorator("PUT");
export const Delete = createMethodDecorator("DELETE");
export const Patch = createMethodDecorator("PATCH");

// Legacy Route decorator for compatibility
export function Route(method: string, path: string): MethodDecorator {
  return function (target: object, propertyKey: string | symbol): void {
    const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_META_KEY, target.constructor) || [];
    routes.push({
      method: method as RouteDefinition["method"],
      path,
      methodName: propertyKey,
    });
    Reflect.defineMetadata(ROUTES_META_KEY, routes, target.constructor);
  };
}
