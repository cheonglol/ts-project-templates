import { CronJobService, CronJobServiceInstance, CRONJOB_TIME_INTERVAL, CRONJOB_CONFIG } from "../../class/services/node-cron.service";
import { setupTestEnvironment, teardownTestEnvironment, resetLogger, mockLogger } from "../test-helper";

// Mock node-cron
jest.mock("node-cron", () => ({
  validate: jest.fn().mockReturnValue(true),
  schedule: jest.fn().mockReturnValue({
    stop: jest.fn(),
  }),
}));

describe("CronJobService", () => {
  let service: CronJobService;
  let mockConsole: ReturnType<typeof mockLogger>;

  beforeEach(() => {
    setupTestEnvironment();
    resetLogger();
    mockConsole = mockLogger();

    // Reset singleton instance for each test
    (CronJobService as unknown as { instance: CronJobService | undefined }).instance = undefined;
    service = CronJobService.getInstance();
  });

  afterEach(() => {
    // Stop any running cron jobs
    service.stopAllCronJobs();
    teardownTestEnvironment();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = CronJobService.getInstance();
      const instance2 = CronJobService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(service);
    });

    it("should return the same instance as CronJobServiceInstance", () => {
      const instance = CronJobService.getInstance();

      expect(CronJobServiceInstance).toStrictEqual(instance);
    });
  });

  describe("Task Registration", () => {
    it("should register a task successfully", () => {
      const task = {
        name: "test-task",
        schedule: CRONJOB_TIME_INTERVAL.EVERY_1_MINUTE,
        onTick: jest.fn(),
      };

      service.registerTask(task);

      const tasks = service.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual(task);
    });

    it("should register multiple tasks", () => {
      const task1 = {
        name: "task-1",
        schedule: CRONJOB_TIME_INTERVAL.EVERY_5_MINUTES,
        onTick: jest.fn(),
      };

      const task2 = {
        name: "task-2",
        schedule: CRONJOB_TIME_INTERVAL.EVERY_1_HOUR,
        onTick: jest.fn(),
      };

      service.registerTask(task1);
      service.registerTask(task2);

      const tasks = service.getTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks).toEqual([task1, task2]);
    });
  });

  describe("Cron Job Management", () => {
    it("should start cron jobs for valid schedules", () => {
      const task = {
        name: "valid-task",
        schedule: CRONJOB_TIME_INTERVAL.EVERY_1_MINUTE,
        onTick: jest.fn(),
      };

      service.registerTask(task);
      service.startCronJobs();

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it("should handle empty task list", () => {
      service.startCronJobs();

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it("should stop all cron jobs", () => {
      const task = {
        name: "stoppable-task",
        schedule: CRONJOB_TIME_INTERVAL.EVERY_1_MINUTE,
        onTick: jest.fn(),
      };

      service.registerTask(task);
      service.startCronJobs();
      service.stopAllCronJobs();

      expect(mockConsole.log).toHaveBeenCalled();
    });
  });

  describe("Time Intervals", () => {
    it("should have all expected time intervals defined", () => {
      expect(CRONJOB_TIME_INTERVAL.EVERY_1_MINUTE).toBe("* * * * *");
      expect(CRONJOB_TIME_INTERVAL.EVERY_5_MINUTES).toBe("*/5 * * * *");
      expect(CRONJOB_TIME_INTERVAL.EVERY_1_HOUR).toBe("0 * * * *");
      expect(CRONJOB_TIME_INTERVAL.EVERY_1_DAY).toBe("0 0 * * *");
    });
  });

  describe("Configuration", () => {
    it("should have correct timezone configuration", () => {
      expect(CRONJOB_CONFIG.CRONJOB_TIMEZONE).toBe("Asia/Singapore");
    });
  });
});
