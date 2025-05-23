import { FastifyRequest, FastifyReply } from "fastify";

/**
 * Base controller class that provides standard response methods
 */
export abstract class BaseController {
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
  protected sendError(reply: FastifyReply, content: string, metadata: Record<string, unknown> = {}, statusCode: number = 400): void {
    reply.status(statusCode).send({
      content,
      timestamp: new Date().toISOString(),
      status: "error",
      metadata,
    });
  }

  // New utility methods for common response patterns
  protected async handleRequest<T>(reply: FastifyReply, handler: () => Promise<T>, successMessage: string, errorMessage: string = "An error occurred"): Promise<void> {
    try {
      const result = await handler();
      this.sendSuccess(reply, successMessage, { data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : errorMessage;
      this.sendError(reply, message);
    }
  }
}

// Generic CRUD controller that can be extended
export abstract class CrudController<T> extends BaseController {
  protected abstract serviceName: string;

  // Implement in derived classes to provide the actual service
  protected abstract getAll(): Promise<T[]>;
  protected abstract getById(id: string | number): Promise<T | null>;
  protected abstract create(data: Partial<T>): Promise<T>;
  protected abstract update(id: string | number, data: Partial<T>): Promise<T | null>;
  protected abstract delete(id: string | number): Promise<boolean>;

  // Standard CRUD handlers
  async handleGetAll(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await this.handleRequest(reply, () => this.getAll(), `${this.serviceName} items retrieved successfully`);
  }

  async handleGetById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    const { id } = request.params;
    await this.handleRequest(reply, () => this.getById(id), `${this.serviceName} item retrieved successfully`, `${this.serviceName} item not found`);
  }

  async handleCreate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = request.body as Partial<T>;
    await this.handleRequest(reply, () => this.create(data), `${this.serviceName} created successfully`, `Failed to create ${this.serviceName}`);
  }

  async handleUpdate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    const { id } = request.params;
    const data = request.body as Partial<T>;
    await this.handleRequest(reply, () => this.update(id, data), `${this.serviceName} updated successfully`, `Failed to update ${this.serviceName}`);
  }

  async handleDelete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    const { id } = request.params;
    await this.handleRequest(reply, () => this.delete(id), `${this.serviceName} deleted successfully`, `Failed to delete ${this.serviceName}`);
  }
}
