import { BaseRepository, DatabaseConnection, RepositoryConfig } from "../../class/base/base-repository.class";
import { ValidationError, DatabaseError } from "../../class/common/errors.class";
import { setupTestEnvironment, teardownTestEnvironment, resetLogger } from "../test-helper";

// Mock entity for testing
interface TestEntity extends Record<string, unknown> {
  id: number;
  name: string;
  email: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

// Mock DatabaseConnection implementation
class MockDatabaseConnection implements DatabaseConnection {
  private data: TestEntity[] = [];
  private idCounter = 1;

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    // Simple mock query implementation
    if (sql.includes("SELECT COUNT(*)")) {
      return [{ total: this.data.length }] as T[];
    }

    if (sql.includes("SELECT *")) {
      let results = [...this.data];

      // Handle WHERE conditions
      if (params && params.length > 0 && sql.includes("WHERE")) {
        if (sql.includes("id = ?")) {
          results = results.filter((item) => item.id === params[0]);
        }
        if (sql.includes("email = ?")) {
          results = results.filter((item) => item.email === params[0]);
        }
      }

      // Handle LIMIT and OFFSET
      if (sql.includes("LIMIT")) {
        const limitMatch = sql.match(/LIMIT (\d+)/);
        const offsetMatch = sql.match(/OFFSET (\d+)/);
        const limit = limitMatch ? parseInt(limitMatch[1]) : results.length;
        const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;
        results = results.slice(offset, offset + limit);
      }

      return results as T[];
    }

    return [] as T[];
  }

  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: number | string }> {
    if (sql.includes("INSERT INTO")) {
      // Extract values from INSERT statement
      const newEntity: TestEntity = {
        id: this.idCounter++,
        name: (params?.[0] as string) || "Test Name",
        email: (params?.[1] as string) || "test@example.com",
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.data.push(newEntity);
      return { affectedRows: 1, insertId: newEntity.id };
    }

    if (sql.includes("UPDATE")) {
      const id = params?.[params.length - 1] as number;
      const index = this.data.findIndex((item) => item.id === id);
      if (index !== -1) {
        this.data[index] = { ...this.data[index], updated_at: new Date() };
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    }

    if (sql.includes("DELETE")) {
      const id = params?.[0] as number;
      const index = this.data.findIndex((item) => item.id === id);
      if (index !== -1) {
        if (sql.includes("deleted_at")) {
          // Soft delete
          this.data[index].deleted_at = new Date();
        } else {
          // Hard delete
          this.data.splice(index, 1);
        }
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    }

    return { affectedRows: 0 };
  }

  async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    // Simple mock - just execute the callback with this connection
    return await callback(this);
  }

  // Helper methods for testing
  clearData(): void {
    this.data = [];
    this.idCounter = 1;
  }

  addTestData(entities: TestEntity[]): void {
    this.data.push(...entities);
    this.idCounter = Math.max(...entities.map((e) => e.id)) + 1;
  }
}

// Concrete test repository
class TestRepository extends BaseRepository<TestEntity> {
  constructor(connection: DatabaseConnection, config: RepositoryConfig) {
    super(connection, config);
  }

  // Add a custom method for testing
  async findByEmail(email: string): Promise<TestEntity | null> {
    const sql = this.buildSelectSql() + " AND email = ?";
    return await this.queryOne<TestEntity>(sql, [email]);
  }
}

describe("BaseRepository", () => {
  let mockConnection: MockDatabaseConnection;
  let repository: TestRepository;
  let config: RepositoryConfig;

  beforeEach(() => {
    setupTestEnvironment();
    resetLogger();

    mockConnection = new MockDatabaseConnection();
    config = {
      tableName: "test_entities",
      primaryKey: "id",
      timestamps: true,
      softDelete: false,
    };
    repository = new TestRepository(mockConnection, config);
  });

  afterEach(() => {
    mockConnection.clearData();
    teardownTestEnvironment();
  });

  describe("Configuration", () => {
    it("should use default configuration values", () => {
      const defaultRepo = new TestRepository(mockConnection, {
        tableName: "test_table",
      });

      expect((defaultRepo as any).config).toEqual({
        tableName: "test_table",
        primaryKey: "id",
        timestamps: true,
        softDelete: false,
      });
    });

    it("should override default configuration", () => {
      const customConfig = {
        tableName: "custom_table",
        primaryKey: "uuid",
        timestamps: false,
        softDelete: true,
      };
      const customRepo = new TestRepository(mockConnection, customConfig);

      expect((customRepo as any).config).toEqual(customConfig);
    });
  });

  describe("findAll", () => {
    it("should return empty array when no data", async () => {
      const results = await repository.findAll();
      expect(results).toEqual([]);
    });

    it("should return all entities", async () => {
      const testData: TestEntity[] = [
        { id: 1, name: "Test 1", email: "test1@example.com", created_at: new Date(), updated_at: new Date() },
        { id: 2, name: "Test 2", email: "test2@example.com", created_at: new Date(), updated_at: new Date() },
      ];
      mockConnection.addTestData(testData);

      const results = await repository.findAll();
      expect(results).toHaveLength(2);
      expect(results).toEqual(testData);
    });
  });

  describe("findById", () => {
    it("should return null when entity not found", async () => {
      const result = await repository.findById(999);
      expect(result).toBeNull();
    });

    it("should return entity when found", async () => {
      const testEntity: TestEntity = {
        id: 1,
        name: "Test Entity",
        email: "test@example.com",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockConnection.addTestData([testEntity]);

      const result = await repository.findById(1);
      expect(result).toEqual(testEntity);
    });
  });

  describe("create", () => {
    it("should create new entity with timestamps", async () => {
      const newEntity = {
        name: "New Entity",
        email: "new@example.com",
      };

      const result = await repository.create(newEntity);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe(newEntity.name);
      expect(result.email).toBe(newEntity.email);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it("should create entity without timestamps when disabled", async () => {
      const noTimestampRepo = new TestRepository(mockConnection, {
        tableName: "test_entities",
        timestamps: false,
      });

      const newEntity = {
        name: "New Entity",
        email: "new@example.com",
      };

      const result = await noTimestampRepo.create(newEntity);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  describe("update", () => {
    it("should return null when entity not found", async () => {
      const result = await repository.update(999, { name: "Updated" });
      expect(result).toBeNull();
    });

    it("should update existing entity", async () => {
      const testEntity: TestEntity = {
        id: 1,
        name: "Original Name",
        email: "test@example.com",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockConnection.addTestData([testEntity]);

      const updateData = { name: "Updated Name" };
      const result = await repository.update(1, updateData);

      expect(result).toBeDefined();
      expect(result!.name).toBe(updateData.name);
      expect(result!.email).toBe(testEntity.email); // unchanged
    });
  });

  describe("delete", () => {
    it("should return false when entity not found", async () => {
      const result = await repository.delete(999);
      expect(result).toBe(false);
    });

    it("should perform hard delete when soft delete disabled", async () => {
      const testEntity: TestEntity = {
        id: 1,
        name: "Test Entity",
        email: "test@example.com",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockConnection.addTestData([testEntity]);

      const result = await repository.delete(1);
      expect(result).toBe(true);

      // Entity should not be found after hard delete
      const found = await repository.findById(1);
      expect(found).toBeNull();
    });

    it("should perform soft delete when enabled", async () => {
      const softDeleteRepo = new TestRepository(mockConnection, {
        tableName: "test_entities",
        softDelete: true,
      });

      const testEntity: TestEntity = {
        id: 1,
        name: "Test Entity",
        email: "test@example.com",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockConnection.addTestData([testEntity]);

      const result = await softDeleteRepo.delete(1);
      expect(result).toBe(true);
    });
  });

  describe("findAllPaginated", () => {
    beforeEach(() => {
      const testData: TestEntity[] = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `Test ${i + 1}`,
        email: `test${i + 1}@example.com`,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      mockConnection.addTestData(testData);
    });

    it("should return paginated results", async () => {
      const result = await repository.findAllPaginated(1, 10);

      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(25);
    });

    it("should validate page and limit parameters", async () => {
      await expect(repository.findAllPaginated(0, 10)).rejects.toThrow(ValidationError);
      await expect(repository.findAllPaginated(1, 0)).rejects.toThrow(ValidationError);
    });
  });

  describe("Custom methods", () => {
    it("should support custom query methods", async () => {
      const testEntity: TestEntity = {
        id: 1,
        name: "Test Entity",
        email: "test@example.com",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockConnection.addTestData([testEntity]);

      const result = await repository.findByEmail("test@example.com");
      expect(result).toEqual(testEntity);
    });
  });

  describe("SQL Building", () => {
    it("should build correct SELECT SQL", () => {
      const sql = (repository as any).buildSelectSql();
      expect(sql).toBe("SELECT * FROM test_entities");
    });

    it("should build SELECT SQL with soft delete", () => {
      const softDeleteRepo = new TestRepository(mockConnection, {
        tableName: "test_entities",
        softDelete: true,
      });

      const sql = (softDeleteRepo as any).buildSelectSql();
      expect(sql).toBe("SELECT * FROM test_entities WHERE deleted_at IS NULL");
    });

    it("should build correct INSERT SQL", () => {
      const data = { name: "Test", email: "test@example.com" };
      const result = (repository as any).buildInsertSql(data);

      expect(result.sql).toBe("INSERT INTO test_entities (name, email) VALUES (?, ?)");
      expect(result.values).toEqual(["Test", "test@example.com"]);
    });
  });
});
