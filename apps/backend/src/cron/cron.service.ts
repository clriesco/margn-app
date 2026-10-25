import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { runDailyCheck } from "./jobs/daily-check.job";
import { refreshMetrics } from "./jobs/metrics-refresh.job";
import { ingestPrices } from "./jobs/price-ingestion.job";

/**
 * Service that executes the cron jobs
 * Jobs are compiled with the backend and share its PrismaService connection,
 * so running them loads neither ts-node nor additional Prisma engines.
 */
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Execute price ingestion job
   * Fetches latest prices from Yahoo Finance and stores in database
   */
  async runPriceIngestion(): Promise<{ success: boolean; message: string }> {
    this.logger.log("🔄 Starting price ingestion...");

    try {
      await ingestPrices(this.prismaService);

      this.logger.log("✅ Price ingestion completed successfully");
      return {
        success: true,
        message: "Price ingestion completed successfully",
      };
    } catch (error) {
      this.logger.error("❌ Price ingestion failed:", error);
      throw error;
    }
  }

  /**
   * Execute metrics refresh job
   * Recalculates portfolio metrics (equity, exposure, leverage)
   */
  async runMetricsRefresh(): Promise<{ success: boolean; message: string }> {
    this.logger.log("🔄 Starting metrics refresh...");

    try {
      await refreshMetrics(this.prismaService);

      this.logger.log("✅ Metrics refresh completed successfully");
      return {
        success: true,
        message: "Metrics refresh completed successfully",
      };
    } catch (error) {
      this.logger.error("❌ Metrics refresh failed:", error);
      throw error;
    }
  }

  /**
   * Execute daily check job
   * Generates status notifications
   */
  async runDailyCheck(): Promise<{ success: boolean; message: string }> {
    this.logger.log("🔍 Starting daily check...");

    try {
      const result = await runDailyCheck(this.prismaService);

      this.logger.log(
        `✅ Daily check completed: ${result.portfoliosChecked} portfolios, ${result.notificationsGenerated} notifications`
      );
      return {
        success: true,
        message: `Daily check completed: ${result.portfoliosChecked} portfolios checked, ${result.notificationsGenerated} notifications generated`,
      };
    } catch (error) {
      this.logger.error("❌ Daily check failed:", error);
      throw error;
    }
  }
}
