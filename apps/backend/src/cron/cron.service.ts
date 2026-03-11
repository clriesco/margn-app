import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Service that executes cron job scripts
 * Uses ts-node to execute TypeScript files from infra/scripts at runtime
 */
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  private tsNodeRegistered = false;

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Register ts-node to enable TypeScript execution at runtime
   * This allows us to require .ts files directly without compilation
   */
  private registerTsNode(): void {
    if (this.tsNodeRegistered) {
      return;
    }

    try {
      // Register ts-node with transpileOnly to skip type checking
      // (infra scripts live outside the backend's strict tsconfig)
      require("ts-node").register({
        transpileOnly: true,
        compilerOptions: {
          module: "commonjs",
          moduleResolution: "node",
          target: "ES2020",
          esModuleInterop: true,
        },
      });
      this.tsNodeRegistered = true;
      this.logger.debug("ts-node registered for runtime TypeScript execution");
    } catch (error) {
      this.logger.warn(
        "ts-node not available, falling back to compiled JS files",
        error
      );
    }
  }

  /**
   * Execute price ingestion job
   * Fetches latest prices from Yahoo Finance and stores in database
   */
  async runPriceIngestion(): Promise<{ success: boolean; message: string }> {
    this.logger.log("🔄 Starting price ingestion...");

    try {
      this.registerTsNode();

      // Import the ingestion logic dynamically
      // Using require() with ts-node allows TypeScript files to be executed at runtime
      const priceIngestionModule = require("../../../../infra/scripts/price-ingestion");

      // The script creates its own PrismaClient, but we can still use it
      // The script will handle its own connection/disconnection
      await priceIngestionModule.ingestPrices();

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
      this.registerTsNode();

      // Import the refresh logic dynamically
      const metricsRefreshModule = require("../../../../infra/scripts/metrics-refresh");

      await metricsRefreshModule.refreshMetrics();

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
      this.registerTsNode();

      // Import the daily check logic dynamically
      const dailyCheckModule = require("../../../../infra/scripts/daily-check");

      const result = await dailyCheckModule.runDailyCheck();

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
