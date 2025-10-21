import { FastifyRequest, FastifyReply } from "fastify";
import { Logger } from "../../shared/logging/logger";
import { EnvVarKeys } from "../../shared/env-validation.module";
import { APP_ERROR_CODE } from "../../data/enums/error-codes.enum";
import { z } from "zod";
import * as crypto from "crypto";

/**
 * Base controller class that provides standard response methods
 */
export abstract class BaseController {
  protected logger: Logger = Logger.getInstance();

  /**
   * Send a success response
   */
  protected sendSuccess(reply: FastifyReply, content: string, metadata: Record<string, unknown> = {}, statusCode: number = 200): void {
    reply.status(statusCode).send({
      content,
      timestamp: new Date().toISOString(),
      status: "success",
      metadata,
    });
  }

  /**
   * Send an error response
   */
  protected sendError(reply: FastifyReply, content: string, metadata: Record<string, unknown> = {}, statusCode: number = 400, errorCode?: APP_ERROR_CODE): void {
    this.logger.error(`Controller error: ${content}`, this.constructor.name);
    reply.status(statusCode).send({
      content,
      timestamp: new Date().toISOString(),
      status: "error",
      metadata: {
        ...metadata,
        errorCode: errorCode || APP_ERROR_CODE.INTERNAL_SERVER_ERROR,
      },
    });
  }

  // New utility methods for common response patterns
  protected async handleRequest<T>(
    reply: FastifyReply,
    handler: () => Promise<T>,
    successMessage: string,
    errorMessage: string = "An error occurred",
    errorCode?: APP_ERROR_CODE
  ): Promise<void> {
    try {
      const result = await handler();
      this.sendSuccess(reply, successMessage, { data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : errorMessage;
      this.sendError(reply, message, {}, 500, errorCode);
    }
  }
}

// Generic CRUD controller that can be extended
export abstract class CrudController<T> extends BaseController {
  // Infer serviceName from class name (e.g., UserController -> "User")
  protected get serviceName(): string {
    return this.constructor.name.replace(/Controller$/, "");
  }

  // Zod schemas for validation
  protected abstract createSchema: z.ZodSchema<T>;
  protected abstract updateSchema: z.ZodSchema<Partial<T>>;

  // Implement in derived classes to provide the actual service
  protected abstract getAll(): Promise<T[]>;
  protected abstract getById(id: string | number): Promise<T | null>;
  protected abstract create(data: Partial<T>): Promise<T>;
  protected abstract update(id: string | number, data: Partial<T>): Promise<T | null>;
  protected abstract delete(id: string | number): Promise<boolean>;

  // Standard CRUD handlers
  async handleGetAll(request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply: FastifyReply): Promise<void> {
    const page = parseInt(request.query.page || "1", 10);
    const limit = parseInt(request.query.limit || "10", 10);
    await this.handleRequest(reply, () => this.getAllPaginated(page, limit), `${this.serviceName} items retrieved successfully`);
  }

  // Abstract method for paginated getAll
  protected async getAllPaginated(page: number, limit: number): Promise<{ items: T[]; total: number; page: number; limit: number }> {
    const allItems = await this.getAll();
    const total = allItems.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const items = allItems.slice(start, end);
    return { items, total, page, limit };
  }

  async handleGetById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    const { id } = request.params;
    await this.handleRequest(
      reply,
      async () => {
        const result = await this.getById(id);
        if (!result) {
          throw new Error(`${this.serviceName} item not found`);
        }
        return result;
      },
      `${this.serviceName} item retrieved successfully`,
      `${this.serviceName} item not found`,
      APP_ERROR_CODE.NOT_FOUND
    );
  }

  async handleCreate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = request.body as Partial<T>;
    try {
      const validatedData = this.createSchema.parse(data);
      await this.handleRequest(
        reply,
        () => this.create(validatedData),
        `${this.serviceName} created successfully`,
        `Failed to create ${this.serviceName}`,
        APP_ERROR_CODE.BAD_REQUEST
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.sendError(reply, "Validation failed", { errors: error.issues }, 400, APP_ERROR_CODE.VALIDATION_ERROR);
      } else {
        await this.handleRequest(reply, () => this.create(data), `${this.serviceName} created successfully`, `Failed to create ${this.serviceName}`, APP_ERROR_CODE.BAD_REQUEST);
      }
    }
  }

  async handleUpdate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    const { id } = request.params;
    const data = request.body as Partial<T>;
    try {
      const validatedData = this.updateSchema.parse(data);
      await this.handleRequest(
        reply,
        async () => {
          const result = await this.update(id, validatedData);
          if (!result) {
            throw new Error(`${this.serviceName} item not found`);
          }
          return result;
        },
        `${this.serviceName} updated successfully`,
        `Failed to update ${this.serviceName}`,
        APP_ERROR_CODE.NOT_FOUND
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.sendError(reply, "Validation failed", { errors: error.issues }, 400, APP_ERROR_CODE.VALIDATION_ERROR);
      } else {
        await this.handleRequest(
          reply,
          async () => {
            const result = await this.update(id, data);
            if (!result) {
              throw new Error(`${this.serviceName} item not found`);
            }
            return result;
          },
          `${this.serviceName} updated successfully`,
          `Failed to update ${this.serviceName}`,
          APP_ERROR_CODE.NOT_FOUND
        );
      }
    }
  }

  async handleDelete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    const { id } = request.params;
    await this.handleRequest(
      reply,
      async () => {
        const result = await this.delete(id);
        if (!result) {
          throw new Error(`${this.serviceName} item not found`);
        }
        return result;
      },
      `${this.serviceName} deleted successfully`,
      `Failed to delete ${this.serviceName}`,
      APP_ERROR_CODE.NOT_FOUND
    );
  }
}

// Specialized controller for webhooks. Provides helpers for verifying signatures and
// parsing raw payloads when needed. This follows the pattern of BaseController
// and allows webhook-specific subclasses to reuse common helper logic.
export abstract class WebhookController extends BaseController {
  /**
   * Verify a request signature using a shared secret from environment.
   * Subclasses can override or use a specific algorithm.
   */
  protected verifySignature(signatureHeader: string | undefined, payload: string): boolean {
    if (!signatureHeader) return false;
    const secret = process.env[EnvVarKeys.WEBHOOK_SECRET];
    if (!secret) return false;

    // Default behavior: HMAC using configurable algorithm and header format 'alg=hex'
    try {
      const algorithm = process.env[EnvVarKeys.WEBHOOK_SIGNATURE_ALGORITHM] || "sha256";
      const [prefix, hash] = signatureHeader.split("=");
      if (!hash) return false;
      // If the header includes an algorithm prefix, require it to match the configured algorithm
      if (prefix && prefix !== algorithm) return false;
      const hmac = crypto.createHmac(algorithm, secret).update(payload).digest("hex");
      return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(hash, "hex"));
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${String(err)}`, this.constructor.name);
      return false;
    }
  }

  /**
   * Parse raw request body into JSON. Useful for webhook endpoints that require raw body verification.
   */
  protected parseJsonPayload(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch (err) {
      this.logger.error(`Failed to parse webhook payload: ${String(err)}`, this.constructor.name);
      throw err;
    }
  }
}

// Specialized controller for websockets. Provides helpers for sending messages
// and handling connection lifecycle events. This allows websocket-specific
// subclasses to reuse shared logic and follow the project's base controller pattern.
export abstract class WebsocketController extends BaseController {
  /** Called when a client connects. Override in subclasses to initialize state. */
  protected onConnect(clientId: string, _meta?: Record<string, unknown>): void {
    this.logger.info(`Websocket client connected: ${clientId}`, this.constructor.name);
  }

  /** Called when a client disconnects. Override in subclasses to cleanup. */
  protected onDisconnect(clientId: string, reason?: string): void {
    this.logger.info(`Websocket client disconnected: ${clientId} (${reason || "no reason"})`, this.constructor.name);
  }

  /** Send a JSON message to a websocket client. Override serializer if needed. */
  protected sendMessage(sendFn: (data: string) => void, payload: unknown): void {
    try {
      const message = JSON.stringify(payload);
      sendFn(message);
    } catch (err) {
      this.logger.error(`Failed to send websocket message: ${String(err)}`, this.constructor.name);
    }
  }

  /** Parse text message payload into JSON. */
  protected parseMessage<T = unknown>(message: string): T {
    try {
      return JSON.parse(message) as T;
    } catch (err) {
      this.logger.error(`Failed to parse websocket message: ${String(err)}`, this.constructor.name);
      throw err;
    }
  }
}
