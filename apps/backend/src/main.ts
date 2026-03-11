import { resolve } from "node:path";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { config as dotenvConfig } from "dotenv";

import { AppModule } from "./app.module";

// Load .env from backend directory
dotenvConfig({
  path: resolve(__dirname, "../.env"),
});

async function bootstrap() {
  // Disable default body parser so we can configure it with rawBody + custom limit.
  // Using rawBody: true with a separate app.use(json()) clobbers the raw buffer
  // that Stripe webhook signature verification depends on.
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  // Register body parsers with rawBody support AND increased size limit
  app.useBodyParser("json", { limit: "5mb" });
  app.useBodyParser("urlencoded", { limit: "5mb", extended: true });

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
