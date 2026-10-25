import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma service that manages database connections
 * Extends PrismaClient and implements NestJS lifecycle hooks
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * Connect to database on module initialization
   */
  async onModuleInit() {
    // Log only host:port — the full URL carries the database password
    const dbHost =
      process.env.DATABASE_URL?.split("@").pop()?.split("/")[0] || "NOT SET";
    console.log("[Prisma] Attempting connection to:", dbHost);

    const maxAttempts = 5;
    const retryDelayMs = 1500;
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        await this.$connect();
        console.log("[Prisma] ✅ Connected successfully");
        return;
      } catch (error) {
        attempt++;
        console.warn(
          `[Prisma] ⚠️ Connection attempt ${attempt} failed. Retrying in ${retryDelayMs}ms...`
        );
        if (attempt >= maxAttempts) {
          console.error(
            "[Prisma] ❌ Unable to connect to the database after multiple attempts",
            error
          );
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  /**
   * Disconnect from database on module destruction
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
