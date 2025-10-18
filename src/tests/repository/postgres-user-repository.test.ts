import { PostgresUserRepository, User, createPostgresUserRepository } from "../../class/repository/postgres-user.repository";
import { DatabaseConnection } from "../../class/base/base-repository.class";
import { setupTestEnvironment, teardownTestEnvironment, resetLogger } from "../test-helper";

// Mock PostgresRepositoryAdapter
jest.mock("../../shared/postgres-repository-adapter", () => ({
  createPostgresAdapter: jest.fn(),
}));

class MockPostgresConnection implements DatabaseConnection {
  private users: User[] = [];
  private idCounter = 1;

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    // Mock different types of queries
    if (sql.includes("SELECT COUNT(*)")) {
      let count = this.users.length;

      // Apply filters for count
      if (params && params.length > 0) {
        if (sql.includes("created_at BETWEEN")) {
          // Mock date range filtering
          count = this.users.filter((u) => !u.deleted_at).length;
        }
      }

      return [{ total: count.toString() }] as T[];
    }

    if (sql.includes("SELECT *")) {
      let results = [...this.users.filter((u) => !u.deleted_at)];

      // Apply filters
      if (params && params.length > 0) {
        if (sql.includes("email = $1")) {
          results = results.filter((u) => u.email === params[0]);
        }
        if (sql.includes("name ILIKE $1")) {
          const pattern = (params[0] as string).replace(/%/g, "");
          results = results.filter((u) => u.name.toLowerCase().includes(pattern.toLowerCase()));
        }
        if (sql.includes("status = $1")) {
          results = results.filter((u) => u.status === params[0]);
        }
      }

      // Handle pagination
      if (sql.includes("LIMIT") && sql.includes("OFFSET")) {
        const limitMatch = sql.match(/LIMIT \$\d+/);
        const offsetMatch = sql.match(/OFFSET \$\d+/);

        if (limitMatch && offsetMatch && params) {
          const limit = params[params.length - 2] as number;
          const offset = params[params.length - 1] as number;
          results = results.slice(offset, offset + limit);
        }
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
      const newUser: User = {
        id: this.idCounter++,
        email: "test@example.com",
        name: "Test User",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.users.push(newUser);
      return { affectedRows: 1, insertId: newUser.id };
    }

    if (sql.includes("UPDATE") && sql.includes("SET status")) {
      // Mock bulk status update
      const status = params?.[0] as string;
      const userIds = params?.slice(1) as number[];

      let affected = 0;
      this.users.forEach((user) => {
        if (userIds?.includes(user.id) && !user.deleted_at) {
          user.status = status;
          user.updated_at = new Date();
          affected++;
        }
      });

      return { affectedRows: affected };
    }

    if (sql.includes("UPDATE")) {
      const id = params?.[params.length - 1] as number;
      const user = this.users.find((u) => u.id === id && !u.deleted_at);
      if (user) {
        user.updated_at = new Date();
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    }

    if (sql.includes("DELETE") || sql.includes("deleted_at")) {
      const id = params?.[0] as number;
      const user = this.users.find((u) => u.id === id);
      if (user) {
        user.deleted_at = new Date();
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    }

    return { affectedRows: 0 };
  }

  async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  // Helper methods for testing
  addTestUsers(users: User[]): void {
    this.users.push(...users);
    this.idCounter = Math.max(...users.map((u) => u.id)) + 1;
  }

  clearUsers(): void {
    this.users = [];
    this.idCounter = 1;
  }

  getUsers(): User[] {
    return [...this.users];
  }
}

describe("PostgresUserRepository", () => {
  let mockConnection: MockPostgresConnection;
  let repository: PostgresUserRepository;

  beforeEach(() => {
    setupTestEnvironment();
    resetLogger();

    mockConnection = new MockPostgresConnection();

    // Mock the createPostgresAdapter to return our mock connection
    const postgresAdapter = jest.requireMock("../../shared/postgres-repository-adapter");
    postgresAdapter.createPostgresAdapter.mockReturnValue(mockConnection);

    repository = new PostgresUserRepository();
  });

  afterEach(() => {
    mockConnection.clearUsers();
    teardownTestEnvironment();
    jest.clearAllMocks();
  });

  describe("Factory Function", () => {
    it("should create repository instance", () => {
      const repo = createPostgresUserRepository();
      expect(repo).toBeInstanceOf(PostgresUserRepository);
    });
  });

  describe("Configuration", () => {
    it("should be configured for users table", () => {
      const config = (repository as unknown as { config: { tableName: string; primaryKey: string; timestamps: boolean; softDelete: boolean } }).config;

      expect(config.tableName).toBe("users");
      expect(config.primaryKey).toBe("id");
      expect(config.timestamps).toBe(true);
      expect(config.softDelete).toBe(true);
    });
  });

  describe("Custom Query Methods", () => {
    beforeEach(() => {
      const testUsers: User[] = [
        {
          id: 1,
          email: "john@example.com",
          name: "John Doe",
          status: "active",
          created_at: new Date("2023-01-01"),
          updated_at: new Date("2023-01-01"),
        },
        {
          id: 2,
          email: "jane@example.com",
          name: "Jane Smith",
          status: "inactive",
          created_at: new Date("2023-02-01"),
          updated_at: new Date("2023-02-01"),
        },
        {
          id: 3,
          email: "bob@example.com",
          name: "Bob Johnson",
          status: "active",
          created_at: new Date("2023-03-01"),
          updated_at: new Date("2023-03-01"),
        },
      ];
      mockConnection.addTestUsers(testUsers);
    });

    describe("findByEmail", () => {
      it("should find user by email", async () => {
        const user = await repository.findByEmail("john@example.com");

        expect(user).toBeDefined();
        expect(user!.email).toBe("john@example.com");
        expect(user!.name).toBe("John Doe");
      });

      it("should return null for non-existent email", async () => {
        const user = await repository.findByEmail("nonexistent@example.com");
        expect(user).toBeNull();
      });
    });

    describe("findByNamePattern", () => {
      it("should find users by name pattern", async () => {
        const users = await repository.findByNamePattern("John");

        expect(users).toHaveLength(2); // John Doe and Bob Johnson
        expect(users.some((u) => u.name.includes("John"))).toBe(true);
      });

      it("should return empty array for no matches", async () => {
        const users = await repository.findByNamePattern("NonExistent");
        expect(users).toHaveLength(0);
      });

      it("should be case insensitive", async () => {
        const users = await repository.findByNamePattern("john");
        expect(users.length).toBeGreaterThan(0);
      });
    });

    describe("findByStatus", () => {
      it("should find users by status", async () => {
        const activeUsers = await repository.findByStatus("active");
        expect(activeUsers).toHaveLength(2);
        expect(activeUsers.every((u) => u.status === "active")).toBe(true);
      });

      it("should find inactive users", async () => {
        const inactiveUsers = await repository.findByStatus("inactive");
        expect(inactiveUsers).toHaveLength(1);
        expect(inactiveUsers[0].name).toBe("Jane Smith");
      });
    });
  });

  describe("Advanced Operations", () => {
    beforeEach(() => {
      const testUsers: User[] = [
        {
          id: 1,
          email: "user1@example.com",
          name: "User One",
          status: "active",
          created_at: new Date("2023-01-01"),
          updated_at: new Date("2023-01-01"),
        },
        {
          id: 2,
          email: "user2@example.com",
          name: "User Two",
          status: "active",
          created_at: new Date("2023-02-01"),
          updated_at: new Date("2023-02-01"),
        },
        {
          id: 3,
          email: "user3@example.com",
          name: "User Three",
          status: "inactive",
          created_at: new Date("2023-03-01"),
          updated_at: new Date("2023-03-01"),
        },
      ];
      mockConnection.addTestUsers(testUsers);
    });

    describe("getCountByDateRange", () => {
      it("should return count for date range", async () => {
        const startDate = new Date("2023-01-01");
        const endDate = new Date("2023-12-31");

        const count = await repository.getCountByDateRange(startDate, endDate);
        expect(count).toBe(3);
      });

      it("should handle empty date range", async () => {
        const startDate = new Date("2024-01-01");
        const endDate = new Date("2024-12-31");

        const count = await repository.getCountByDateRange(startDate, endDate);
        expect(count).toBe(0);
      });
    });

    describe("bulkUpdateStatus", () => {
      it("should update status for multiple users", async () => {
        const userIds = [1, 2];
        const newStatus = "suspended";

        const affectedRows = await repository.bulkUpdateStatus(userIds, newStatus);
        expect(affectedRows).toBe(2);
      });

      it("should handle empty user IDs array", async () => {
        const affectedRows = await repository.bulkUpdateStatus([], "suspended");
        expect(affectedRows).toBe(0);
      });

      it("should handle non-existent user IDs", async () => {
        const userIds = [999, 998];
        const affectedRows = await repository.bulkUpdateStatus(userIds, "suspended");
        expect(affectedRows).toBe(0);
      });
    });

    describe("findWithFilters", () => {
      it("should support pagination", async () => {
        const result = await repository.findWithFilters({
          page: 1,
          limit: 2,
        });

        expect(result.items).toHaveLength(2);
        expect(result.total).toBe(3);
      });

      it("should filter by status", async () => {
        const result = await repository.findWithFilters({
          page: 1,
          limit: 10,
          status: "active",
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.every((u) => u.status === "active")).toBe(true);
      });

      it("should filter by name pattern", async () => {
        const result = await repository.findWithFilters({
          page: 1,
          limit: 10,
          namePattern: "One",
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].name).toBe("User One");
      });

      it("should filter by creation date", async () => {
        const result = await repository.findWithFilters({
          page: 1,
          limit: 10,
          createdAfter: new Date("2023-01-15"),
        });

        expect(result.items).toHaveLength(2); // Users 2 and 3
      });

      it("should combine multiple filters", async () => {
        const result = await repository.findWithFilters({
          page: 1,
          limit: 10,
          status: "active",
          namePattern: "User",
          createdAfter: new Date("2022-12-31"),
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.every((u) => u.status === "active")).toBe(true);
      });
    });
  });

  describe("Data Transformation", () => {
    it("should transform dates correctly", async () => {
      const testUser: User = {
        id: 1,
        email: "test@example.com",
        name: "Test User",
        status: "active",
        created_at: new Date("2023-01-01T10:00:00Z"),
        updated_at: new Date("2023-01-02T10:00:00Z"),
      };
      mockConnection.addTestUsers([testUser]);

      const user = await repository.findById(1);

      expect(user).toBeDefined();
      expect(user!.created_at).toBeInstanceOf(Date);
      expect(user!.updated_at).toBeInstanceOf(Date);
      expect(user!.deleted_at).toBeUndefined();
    });

    it("should handle deleted_at transformation", async () => {
      const testUser: User = {
        id: 1,
        email: "test@example.com",
        name: "Test User",
        status: "active",
        created_at: new Date("2023-01-01"),
        updated_at: new Date("2023-01-02"),
        deleted_at: new Date("2023-01-03"),
      };
      mockConnection.addTestUsers([testUser]);

      // Manually get the user to test transformation (since findById filters deleted)
      const allUsers = mockConnection.getUsers();
      const transformedUser = (repository as unknown as { transformResult: (user: User) => User }).transformResult(allUsers[0]);

      expect(transformedUser.deleted_at).toBeInstanceOf(Date);
    });
  });

  describe("Inheritance from BaseRepository", () => {
    it("should have all base CRUD methods", async () => {
      expect(typeof repository.findAll).toBe("function");
      expect(typeof repository.findById).toBe("function");
      expect(typeof repository.create).toBe("function");
      expect(typeof repository.update).toBe("function");
      expect(typeof repository.delete).toBe("function");
      expect(typeof repository.findAllPaginated).toBe("function");
    });

    it("should use soft delete configuration", async () => {
      const config = (repository as unknown as { config: { softDelete: boolean } }).config;
      expect(config.softDelete).toBe(true);
    });
  });
});
