import { BaseService, Repository } from "../../class/base/base-service.class";
import { ValidationError, DatabaseError } from "../../class/common/errors.class";
import { setupTestEnvironment, teardownTestEnvironment, resetLogger, createMockRepository } from "../test-helper";

// Test entity interface
interface TestEntity extends Record<string, unknown> {
  id: number;
  name: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

// Concrete test service
class TestService extends BaseService<TestEntity> {
  constructor(private repository: Repository<TestEntity>) {
    super();
  }

  protected getRepository(): Repository<TestEntity> {
    return this.repository;
  }

  // Add custom business logic method for testing
  async createUserWithValidation(userData: Partial<TestEntity>): Promise<TestEntity> {
    // Business logic validation
    if (!userData.email || !userData.name) {
      throw new ValidationError({
        message: "Email and name are required",
        context: userData,
      });
    }

    // Check for duplicate email (business logic)
    const existingUser = await this.repository.findAll();
    const duplicate = existingUser.find((u) => u.email === userData.email);
    if (duplicate) {
      throw new ValidationError({
        message: "User with this email already exists",
        context: { email: userData.email },
      });
    }

    return await this.create(userData);
  }

  async getActiveUsers(): Promise<TestEntity[]> {
    const allUsers = await this.findAll();
    return allUsers.filter((user) => (user as unknown as { status: string }).status === "active");
  }
}

describe("BaseService", () => {
  let mockRepository: ReturnType<typeof createMockRepository<TestEntity>>;
  let service: TestService;

  beforeEach(() => {
    setupTestEnvironment();
    resetLogger();

    mockRepository = createMockRepository<TestEntity>();
    service = new TestService(mockRepository);
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe("CRUD Operations", () => {
    describe("findAll", () => {
      it("should call repository findAll", async () => {
        const mockData: TestEntity[] = [
          {
            id: 1,
            name: "Test User",
            email: "test@example.com",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];
        mockRepository.findAll.mockResolvedValue(mockData);

        const result = await service.findAll();

        expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
        expect(result).toEqual(mockData);
      });

      it("should handle repository errors", async () => {
        const error = new Error("Database connection failed");
        mockRepository.findAll.mockRejectedValue(error);

        await expect(service.findAll()).rejects.toThrow("Database connection failed");
        expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
      });
    });

    describe("findById", () => {
      it("should call repository findById with correct id", async () => {
        const mockUser: TestEntity = {
          id: 1,
          name: "Test User",
          email: "test@example.com",
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockRepository.findById.mockResolvedValue(mockUser);

        const result = await service.findById(1);

        expect(mockRepository.findById).toHaveBeenCalledWith(1);
        expect(result).toEqual(mockUser);
      });

      it("should return null when user not found", async () => {
        mockRepository.findById.mockResolvedValue(null);

        const result = await service.findById(999);

        expect(mockRepository.findById).toHaveBeenCalledWith(999);
        expect(result).toBeNull();
      });
    });

    describe("create", () => {
      it("should call repository create with data", async () => {
        const userData = {
          name: "New User",
          email: "new@example.com",
        };
        const createdUser: TestEntity = {
          id: 1,
          ...userData,
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockRepository.create.mockResolvedValue(createdUser);

        const result = await service.create(userData);

        expect(mockRepository.create).toHaveBeenCalledWith(userData);
        expect(result).toEqual(createdUser);
      });
    });

    describe("update", () => {
      it("should call repository update with id and data", async () => {
        const updateData = { name: "Updated Name" };
        const updatedUser: TestEntity = {
          id: 1,
          name: "Updated Name",
          email: "test@example.com",
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockRepository.update.mockResolvedValue(updatedUser);

        const result = await service.update(1, updateData);

        expect(mockRepository.update).toHaveBeenCalledWith(1, updateData);
        expect(result).toEqual(updatedUser);
      });

      it("should return null when entity not found", async () => {
        mockRepository.update.mockResolvedValue(null);

        const result = await service.update(999, { name: "Updated" });

        expect(mockRepository.update).toHaveBeenCalledWith(999, { name: "Updated" });
        expect(result).toBeNull();
      });
    });

    describe("delete", () => {
      it("should call repository delete with id", async () => {
        mockRepository.delete.mockResolvedValue(true);

        const result = await service.delete(1);

        expect(mockRepository.delete).toHaveBeenCalledWith(1);
        expect(result).toBe(true);
      });

      it("should return false when entity not found", async () => {
        mockRepository.delete.mockResolvedValue(false);

        const result = await service.delete(999);

        expect(mockRepository.delete).toHaveBeenCalledWith(999);
        expect(result).toBe(false);
      });
    });

    describe("findAllPaginated", () => {
      it("should call repository findAllPaginated with page and limit", async () => {
        const paginatedResult = {
          items: [
            {
              id: 1,
              name: "Test User",
              email: "test@example.com",
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          total: 1,
        };
        mockRepository.findAllPaginated.mockResolvedValue(paginatedResult);

        const result = await service.findAllPaginated(1, 10);

        expect(mockRepository.findAllPaginated).toHaveBeenCalledWith(1, 10);
        expect(result).toEqual(paginatedResult);
      });
    });
  });

  describe("Business Logic Methods", () => {
    describe("createUserWithValidation", () => {
      it("should validate required fields", async () => {
        const invalidData = { name: "Test User" }; // missing email

        await expect(service.createUserWithValidation(invalidData)).rejects.toThrow(ValidationError);
        await expect(service.createUserWithValidation(invalidData)).rejects.toThrow("Email and name are required");

        expect(mockRepository.create).not.toHaveBeenCalled();
      });

      it("should check for duplicate emails", async () => {
        const existingUsers: TestEntity[] = [
          {
            id: 1,
            name: "Existing User",
            email: "existing@example.com",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];
        mockRepository.findAll.mockResolvedValue(existingUsers);

        const duplicateData = {
          name: "New User",
          email: "existing@example.com", // duplicate email
        };

        await expect(service.createUserWithValidation(duplicateData)).rejects.toThrow(ValidationError);
        await expect(service.createUserWithValidation(duplicateData)).rejects.toThrow("User with this email already exists");

        expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
        expect(mockRepository.create).not.toHaveBeenCalled();
      });

      it("should create user when validation passes", async () => {
        const userData = {
          name: "Valid User",
          email: "valid@example.com",
        };
        const createdUser: TestEntity = {
          id: 1,
          ...userData,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockRepository.findAll.mockResolvedValue([]); // no existing users
        mockRepository.create.mockResolvedValue(createdUser);

        const result = await service.createUserWithValidation(userData);

        expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
        expect(mockRepository.create).toHaveBeenCalledWith(userData);
        expect(result).toEqual(createdUser);
      });
    });

    describe("getActiveUsers", () => {
      it("should filter and return only active users", async () => {
        const allUsers = [
          { id: 1, name: "User 1", email: "user1@example.com", status: "active", created_at: new Date(), updated_at: new Date() },
          { id: 2, name: "User 2", email: "user2@example.com", status: "inactive", created_at: new Date(), updated_at: new Date() },
          { id: 3, name: "User 3", email: "user3@example.com", status: "active", created_at: new Date(), updated_at: new Date() },
        ] as TestEntity[];

        mockRepository.findAll.mockResolvedValue(allUsers);

        const result = await service.getActiveUsers();

        expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
        expect(result).toHaveLength(2);
        expect(result.every((user) => (user as unknown as { status: string }).status === "active")).toBe(true);
      });

      it("should return empty array when no active users", async () => {
        const allUsers = [{ id: 1, name: "User 1", email: "user1@example.com", status: "inactive", created_at: new Date(), updated_at: new Date() }] as TestEntity[];

        mockRepository.findAll.mockResolvedValue(allUsers);

        const result = await service.getActiveUsers();

        expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
        expect(result).toHaveLength(0);
      });
    });
  });

  describe("Error Handling", () => {
    it("should propagate repository errors", async () => {
      const databaseError = new DatabaseError({
        message: "Connection timeout",
        context: { operation: "findAll" },
      });
      mockRepository.findAll.mockRejectedValue(databaseError);

      await expect(service.findAll()).rejects.toThrow(DatabaseError);
      await expect(service.findAll()).rejects.toThrow("Connection timeout");
    });

    it("should handle validation errors in business logic", async () => {
      const invalidData = {}; // missing required fields

      await expect(service.createUserWithValidation(invalidData)).rejects.toThrow(ValidationError);
    });
  });

  describe("Repository Integration", () => {
    it("should provide access to repository through getRepository", () => {
      const repository = (service as unknown as { getRepository: () => Repository<TestEntity> }).getRepository();
      expect(repository).toBe(mockRepository);
    });

    it("should use repository for all data operations", async () => {
      // Test that all CRUD operations go through the repository
      await service.findAll();
      expect(mockRepository.findAll).toHaveBeenCalled();

      await service.findById(1);
      expect(mockRepository.findById).toHaveBeenCalled();

      const testData = { name: "Test", email: "test@example.com" };
      await service.create(testData).catch(() => {}); // Ignore potential errors
      expect(mockRepository.create).toHaveBeenCalled();

      await service.update(1, testData).catch(() => {}); // Ignore potential errors
      expect(mockRepository.update).toHaveBeenCalled();

      await service.delete(1).catch(() => {}); // Ignore potential errors
      expect(mockRepository.delete).toHaveBeenCalled();

      await service.findAllPaginated(1, 10).catch(() => {}); // Ignore potential errors
      expect(mockRepository.findAllPaginated).toHaveBeenCalled();
    });
  });

  describe("Logger Integration", () => {
    it("should have logger instance", () => {
      const logger = (service as unknown as { logger: unknown }).logger;
      expect(logger).toBeDefined();
    });
  });
});
