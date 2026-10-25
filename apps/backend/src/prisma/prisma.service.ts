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
  private idleTimer?: ReturnType<typeof setInterval>;
  private lastQueryAt = Date.now();
  private inFlightQueries = 0;
  private connected = false;

  /**
   * Connect to database on module initialization
   */
  async onModuleInit() {
    this.setupIdleDisconnect();

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
        this.connected = true;
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
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
    }
    await this.$disconnect();
  }

  /**
   * Close the connection pool after PRISMA_IDLE_DISCONNECT_MINUTES without
   * queries (disabled when unset). Prisma 5 never closes idle pool
   * connections, and their keepalive traffic stops a Railway Serverless
   * service from sleeping. Prisma reconnects on the next query.
   */
  private setupIdleDisconnect(): void {
    const minutes = Number(process.env.PRISMA_IDLE_DISCONNECT_MINUTES);
    if (!minutes || minutes <= 0) {
      return;
    }
    const idleMs = minutes * 60_000;

    this.$use(async (params, next) => {
      this.inFlightQueries++;
      this.connected = true;
      try {
        return await next(params);
      } finally {
        this.inFlightQueries--;
        this.lastQueryAt = Date.now();
      }
    });

    this.idleTimer = setInterval(() => {
      if (!this.connected || this.inFlightQueries > 0) {
        return;
      }
      if (Date.now() - this.lastQueryAt < idleMs) {
        return;
      }
      this.connected = false;
      this.$disconnect()
        .then(() =>
          console.log(`[Prisma] Idle for ${minutes} min, connection pool closed`)
        )
        .catch((error) =>
          console.warn("[Prisma] ⚠️ Idle disconnect failed", error)
        );
    }, Math.min(idleMs, 60_000));
    // The check must not keep the process alive on its own
    this.idleTimer.unref();

    console.log(`[Prisma] Idle disconnect enabled after ${minutes} min`);
  }
}
