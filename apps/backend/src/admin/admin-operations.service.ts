import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { AuditLogService } from "./audit-log.service";

const VALID_JOBS = [
  "price-ingestion",
  "metrics-refresh",
  "daily-check",
] as const;

type JobName = (typeof VALID_JOBS)[number];

@Injectable()
export class AdminOperationsService {
  private readonly logger = new Logger(AdminOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  isValidJob(job: string): job is JobName {
    return (VALID_JOBS as readonly string[]).includes(job);
  }

  /**
   * Get the status of the last run for each cron job.
   */
  async getCronStatus() {
    const statuses = await Promise.all(
      VALID_JOBS.map(async (jobName) => {
        const lastRun = await this.prisma.cronJobLog.findFirst({
          where: { jobName },
          orderBy: { startedAt: "desc" },
        });
        return {
          jobName,
          lastRun: lastRun
            ? {
                status: lastRun.status,
                startedAt: lastRun.startedAt,
                finishedAt: lastRun.finishedAt,
                durationMs: lastRun.durationMs,
                error: lastRun.error,
              }
            : null,
        };
      })
    );

    return statuses;
  }

  /**
   * Record job start. Returns the log ID for later update.
   */
  async recordJobStart(jobName: string, triggeredBy: string): Promise<string> {
    const log = await this.prisma.cronJobLog.create({
      data: {
        jobName,
        status: "running",
        triggeredBy,
      },
    });
    return log.id;
  }

  /**
   * Record job completion.
   */
  async recordJobEnd(
    logId: string,
    status: "success" | "failed",
    summary?: string,
    error?: string
  ) {
    const log = await this.prisma.cronJobLog.findUnique({
      where: { id: logId },
    });

    const durationMs = log
      ? Date.now() - log.startedAt.getTime()
      : null;

    await this.prisma.cronJobLog.update({
      where: { id: logId },
      data: {
        status,
        finishedAt: new Date(),
        durationMs,
        summary,
        error,
      },
    });
  }

  async getJobLogs(params: {
    job?: string;
    days?: number;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, days = 7 } = params;
    const where: any = {};

    if (params.job) where.jobName = params.job;

    const since = new Date();
    since.setDate(since.getDate() - days);
    where.startedAt = { gte: since };

    const [data, total] = await Promise.all([
      this.prisma.cronJobLog.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cronJobLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Trigger a cron job by calling the existing cron endpoint internally.
   */
  async triggerJob(adminId: string, jobName: string, ip?: string) {
    const cronSecret = process.env.CRON_SECRET_TOKEN;
    const backendUrl = `http://localhost:${process.env.PORT || 3003}`;

    const logId = await this.recordJobStart(jobName, `admin:${adminId}`);

    await this.auditLog.log({
      adminId,
      action: "cron.trigger",
      targetType: "cron",
      targetId: jobName,
      details: { jobName },
      ipAddress: ip,
    });

    // Fire and forget — the job runs asynchronously
    const endpoint = `${backendUrl}/api/cron/${jobName}`;
    fetch(endpoint, {
      headers: { Authorization: `Bearer ${cronSecret || ""}` },
    })
      .then(async (res) => {
        if (res.ok) {
          await this.recordJobEnd(logId, "success");
          this.logger.log(`Job ${jobName} completed successfully`);
        } else {
          const text = await res.text();
          await this.recordJobEnd(logId, "failed", undefined, text);
          this.logger.error(`Job ${jobName} failed: ${text}`);
        }
      })
      .catch(async (err) => {
        await this.recordJobEnd(logId, "failed", undefined, err.message);
        this.logger.error(`Job ${jobName} error: ${err.message}`);
      });

    return { logId, status: "started", jobName };
  }
}
