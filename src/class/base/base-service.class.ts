import { Logger } from "../../shared/logging/logger";

export interface Repository<T> {
  findAll(): Promise<T[]>;
  findAllPaginated(page: number, limit: number): Promise<{ items: T[]; total: number }>;
  findById(id: string | number): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(id: string | number, data: Partial<T>): Promise<T | null>;
  delete(id: string | number): Promise<boolean>;
}

export abstract class BaseService<T extends Record<string, unknown>> {
  protected abstract getRepository(): Repository<T>;
  protected logger = Logger.getInstance();

  async findAll(): Promise<T[]> {
    try {
      return await this.getRepository().findAll();
    } catch (error) {
      this.handleError(error, "Error retrieving all items");
      return [];
    }
  }

  async findAllPaginated(page: number, limit: number): Promise<{ items: T[]; total: number; page: number; limit: number }> {
    try {
      const { items, total } = await this.getRepository().findAllPaginated(page, limit);
      return { items, total, page, limit };
    } catch (error) {
      this.handleError(error, "Error retrieving paginated items");
      return { items: [], total: 0, page, limit };
    }
  }

  async findById(id: string | number): Promise<T | null> {
    try {
      return await this.getRepository().findById(id);
    } catch (error) {
      this.handleError(error, `Error retrieving item with id ${id}`);
      return null;
    }
  }

  async create(data: Partial<T>): Promise<T> {
    try {
      return await this.getRepository().create(data);
    } catch (error) {
      this.handleError(error, "Error creating item");
      throw error;
    }
  }

  async update(id: string | number, data: Partial<T>): Promise<T | null> {
    try {
      return await this.getRepository().update(id, data);
    } catch (error) {
      this.handleError(error, `Error updating item with id ${id}`);
      throw error;
    }
  }

  async delete(id: string | number): Promise<boolean> {
    try {
      return await this.getRepository().delete(id);
    } catch (error) {
      this.handleError(error, `Error deleting item with id ${id}`);
      throw error;
    }
  }

  protected handleError(error: unknown, defaultMessage: string): void {
    this.logger.error(`${defaultMessage}: ${error}`, this.constructor.name);
  }
}
