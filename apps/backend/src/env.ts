import * as path from "path";

import * as dotenv from "dotenv";

/**
 * Load environment variables from .env file
 * This must be called before any other imports that use process.env
 *
 * Cron-related variables:
 * - CRON_SECRET_TOKEN: protects the manual /api/cron/* endpoints.
 * - CRON_ENABLED: when set to "true", activates the in-process periodic
 *   scheduler (see cron/cron.scheduler.ts). Must be enabled on exactly one
 *   executing instance per environment to avoid duplicate runs.
 */
dotenv.config({ path: path.resolve(__dirname, "../.env") });
