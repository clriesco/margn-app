#!/usr/bin/env ts-node

/**
 * Script to migrate existing users from Supabase Auth to Clerk
 *
 * For each user in the local database:
 * 1. Creates user in Clerk via API
 * 2. Updates local DB with clerkId
 * 3. If email already exists in Clerk, links by email
 *
 * Idempotent: skips users that already have a clerkId.
 * Rate limited: 100ms between API calls.
 *
 * Required env vars:
 *   CLERK_SECRET_KEY - Clerk secret key (sk_...)
 *   DATABASE_URL     - PostgreSQL connection string
 *
 * Usage:
 *   npx ts-node infra/scripts/migrate-users-to-clerk.ts
 */

import { PrismaClient } from "@prisma/client";
import { createClerkClient } from "@clerk/backend";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

const prisma = new PrismaClient();

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🔄 Starting user migration to Clerk...\n");

  const users = await prisma.user.findMany({
    where: { clerkId: null },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${users.length} users without clerkId.\n`);

  let migrated = 0;
  let linked = 0;
  let failed = 0;

  for (const user of users) {
    try {
      console.log(`Processing: ${user.email}`);

      // Check if user already exists in Clerk by email
      const existingClerkUsers = await clerkClient.users.getUserList({
        emailAddress: [user.email],
      });

      let clerkId: string;

      if (existingClerkUsers.data.length > 0) {
        // User already exists in Clerk — link
        clerkId = existingClerkUsers.data[0].id;
        console.log(`  → Found existing Clerk user: ${clerkId}`);
        linked++;
      } else {
        // Create new user in Clerk
        const clerkUser = await clerkClient.users.createUser({
          emailAddress: [user.email],
          firstName: user.fullName?.split(" ")[0] || undefined,
          lastName: user.fullName?.split(" ").slice(1).join(" ") || undefined,
          skipPasswordRequirement: true,
        });
        clerkId = clerkUser.id;
        console.log(`  → Created Clerk user: ${clerkId}`);
        migrated++;
      }

      // Update local DB with clerkId
      await prisma.user.update({
        where: { id: user.id },
        data: { clerkId },
      });

      console.log(`  ✅ Updated local DB\n`);

      // Rate limit
      await sleep(100);
    } catch (err: any) {
      console.error(`  ❌ Failed for ${user.email}: ${err.message}\n`);
      failed++;
    }
  }

  console.log("📊 Migration Summary:");
  console.log(`   Created in Clerk: ${migrated}`);
  console.log(`   Linked existing:  ${linked}`);
  console.log(`   Failed:           ${failed}`);
  console.log(`   Total processed:  ${users.length}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
