// filepath: c:\Users\Lester\Desktop\repos\justifyprint-chatbot-server\src\service\node-cron.service.ts
import logger from "../common/logging";
import LoggingTags from "../common/enums/logging-tags.enum";
import * as cron from "node-cron";

export enum CRONJOB_CONFIG {
  CRONJOB_TIMEZONE = "Asia/Singapore",
}

export enum CRONJOB_TIME_INTERVAL {
  // node-cron doesn't support seconds in the basic version, adjusting formats
  EVERY_1_MINUTE = "* * * * *",
  EVERY_2_MINUTES = "*/2 * * * *",
  EVERY_5_MINUTES = "*/5 * * * *",
  EVERY_10_MINUTES = "*/10 * * * *",
  EVERY_30_MINUTES = "*/30 * * * *",
  EVERY_1_HOUR = "0 * * * *",
  EVERY_1_DAY = "0 0 * * *",
  EVERY_1_WEEK = "0 0 * * 0",
  EVERY_1_MONTH = "0 0 1 * *",
  EVERY_1_YEAR = "0 0 1 1 *",
}

interface CronTask {
  name: string;
  schedule: string;
  onTick: () => void;
}

/**
 * Singleton service for managing cron jobs.
 */
class CronJobService {
  private static instance: CronJobService;
  private cronJobs: cron.ScheduledTask[] = [];
  private tasks: CronTask[] = [];

  private constructor() {}

  public static getInstance(): CronJobService {
    if (!CronJobService.instance) {
      CronJobService.instance = new CronJobService();
    }
    return CronJobService.instance;
  }

  private getScheduleKey(schedule: string): string {
    return Object.keys(CRONJOB_TIME_INTERVAL).find((key) => CRONJOB_TIME_INTERVAL[key as keyof typeof CRONJOB_TIME_INTERVAL] === schedule) || schedule;
  }

  public registerTask(task: CronTask): void {
    this.tasks.push(task);
    const scheduleKey = this.getScheduleKey(task.schedule);
    logger.info(`Task "${task.name}" registered with schedule: ${scheduleKey}`, "CronJobService.registerTask", LoggingTags.SYSTEM);
  }

  public getTasks(): CronTask[] {
    return this.tasks;
  }

  public startCronJobs(): void {
    if (this.tasks.length === 0) {
      logger.info("No cron jobs registered.", `${CronJobService.name}.${this.startCronJobs.name}`, LoggingTags.STARTUP);
      return;
    }

    this.tasks.forEach((task) => {
      if (cron.validate(task.schedule)) {
        const job = cron.schedule(task.schedule, task.onTick, {
          timezone: CRONJOB_CONFIG.CRONJOB_TIMEZONE,
        });
        this.cronJobs.push(job);
        const scheduleKey = this.getScheduleKey(task.schedule);
        logger.info(`Cron job "${task.name}" started with schedule: ${scheduleKey}`, `${CronJobService.name}.${this.startCronJobs.name}`, LoggingTags.STARTUP);
      } else {
        logger.warn(`Invalid schedule format for task "${task.name}": ${task.schedule}`, `${CronJobService.name}.${this.startCronJobs.name}`, LoggingTags.STARTUP);
      }
    });
  }

  public stopAllCronJobs(): void {
    this.cronJobs.forEach((job) => job.stop());
    logger.info("All cron jobs stopped.", "CronJobService.stopAllCronJobs", LoggingTags.SYSTEM);
  }
}

/**
 * Singleton instance of CronJobService for use throughout the app.
 */
const CronJobServiceInstance = CronJobService.getInstance();

export { CronJobServiceInstance };
