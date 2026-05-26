import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";

import { CronService } from "./cron.service";

/**
 * In-process scheduler that runs the maintenance jobs periodically,
 * replacing the GitHub Actions `daily-jobs.yml` schedule.
 *
 * Each backend instance schedules against its own DATABASE_URL, so the
 * staging service updates the staging DB and production the production DB.
 *
 * The job is only registered when CRON_ENABLED is set, which guarantees a
 * single executor per environment and avoids duplicate runs if the service
 * ever scales to multiple replicas.
 */
@Injectable()
export class CronScheduler implements OnModuleInit {
  private readonly logger = new Logger(CronScheduler.name);

  /** Same cadence and timezone as the workflow it replaces. */
  private static readonly SCHEDULE = "0 */6 * * *";
  private static readonly TIMEZONE = "UTC";
  private static readonly JOB_NAME = "daily-jobs";

  constructor(
    private readonly cronService: CronService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  onModuleInit(): void {
    if (process.env.CRON_ENABLED !== "true") {
      this.logger.log(
        "CRON_ENABLED not set; periodic scheduler is inactive (jobs can still be triggered manually)."
      );
      return;
    }

    const job = new CronJob(
      CronScheduler.SCHEDULE,
      () => {
        void this.runAll();
      },
      null,
      false,
      CronScheduler.TIMEZONE
    );

    this.schedulerRegistry.addCronJob(CronScheduler.JOB_NAME, job);
    job.start();

    this.logger.log(
      `Periodic scheduler active: "${CronScheduler.SCHEDULE}" (${CronScheduler.TIMEZONE}).`
    );
  }

  /**
   * Run the three maintenance jobs in sequence, matching the order of the
   * workflow it replaces. Each job is isolated so a failure neither aborts
   * the remaining jobs nor kills the scheduler.
   */
  async runAll(): Promise<void> {
    this.logger.log("▶️ Periodic daily-jobs run started");

    await this.runJob("price-ingestion", () => this.cronService.runPriceIngestion());
    await this.runJob("metrics-refresh", () => this.cronService.runMetricsRefresh());
    await this.runJob("daily-check", () => this.cronService.runDailyCheck());

    this.logger.log("⏹️ Periodic daily-jobs run finished");
  }

  private async runJob(
    name: string,
    run: () => Promise<unknown>
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Job "${name}" failed during periodic run; continuing with remaining jobs.`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }
}
