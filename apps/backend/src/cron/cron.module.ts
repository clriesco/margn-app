import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";

import { CronController } from "./cron.controller";
import { CronScheduler } from "./cron.scheduler";
import { CronService } from "./cron.service";

@Module({
  imports: [PrismaModule],
  controllers: [CronController],
  providers: [CronService, CronScheduler],
})
export class CronModule {}

