/**
 * Data migration: provision Starter subscriptions for existing users.
 *
 * For each user without a Subscription row:
 *   1. Create a Stripe Customer (if no stripeCustomerId exists)
 *   2. Insert a Subscription row with tier=starter, status=active
 *
 * Safe to re-run — skips users that already have a subscription.
 *
 * Usage:
 *   npx ts-node infra/scripts/migrate-subscriptions.ts
 */

import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

async function main() {
  const usersWithoutSub = await prisma.user.findMany({
    where: { subscription: null },
    select: { id: true, email: true, fullName: true },
  });

  console.log(
    `Found ${usersWithoutSub.length} user(s) without a subscription.`
  );

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of usersWithoutSub) {
    try {
      // Check if Stripe customer already exists for this email
      const existing = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      let customerId: string;
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
        console.log(
          `  [${user.email}] Reusing existing Stripe customer ${customerId}`
        );
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.fullName || undefined,
          metadata: { margn_user_id: user.id },
        });
        customerId = customer.id;
        console.log(
          `  [${user.email}] Created Stripe customer ${customerId}`
        );
      }

      await prisma.subscription.create({
        data: {
          userId: user.id,
          tier: "starter",
          status: "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId: null,
          stripePriceId: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      });

      created++;
      console.log(`  [${user.email}] Starter subscription created.`);
    } catch (err) {
      errors++;
      console.error(`  [${user.email}] ERROR:`, err);
    }

    // Rate limit: 200ms between Stripe calls
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(
    `\nDone. Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`
  );
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
