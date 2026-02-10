import { resolve } from "node:path";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { config as dotenvConfig } from "dotenv";
import { json, urlencoded } from "express";

import { AppModule } from "./app.module";

// Load .env from backend directory
dotenvConfig({
  path: resolve(__dirname, "../.env"),
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Increase body size limit for large payloads (e.g., strategy trajectories)
  app.use(json({ limit: "5mb" }));
  app.use(urlencoded({ extended: true, limit: "5mb" }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  // Enable CORS for frontend
  const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3002")
    .split(",")
    .map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix("api");
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3003);

  console.log(
    `🚀 Backend running on http://localhost:${process.env.PORT || 3003}/api`
  );
}

bootstrap();
