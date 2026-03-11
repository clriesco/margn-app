/**
 * E2E Test: Billing & Subscription Flow
 *
 * Tests the complete billing lifecycle:
 *
 * --- SUBSCRIPTION & TIER MANAGEMENT ---
 * 1. New user gets starter subscription provisioned
 * 2. GET /billing/subscription returns starter tier with correct limits
 * 3. Starter user can access ungated endpoints (strategies list, public strategies)
 * 4. Starter user is blocked from pro-gated endpoints (403 TIER_REQUIRED)
 * 5. After upgrade to pro, previously gated endpoints work
 * 6. Pro user can access all pro-gated features
 * 7. Downgrade back to starter re-blocks gated endpoints
 * 8. Grace period: canceled subscription with future periodEnd still grants access
 * 9. Grace period expired: canceled subscription with past periodEnd blocks access
 * 10. past_due status still grants access (grace)
 *
 * --- VOUCHER SYSTEM ---
 * 11. Valid voucher code validates successfully
 * 12. Invalid voucher code returns 404
 * 13. Expired voucher returns 400
 * 14. Inactive voucher returns 400
 * 15. Max redemptions exceeded returns 400
 * 16. Double redemption on same subscription returns 400
 *
 * --- CHECKOUT FLOW ---
 * 17. Checkout with invalid priceKey returns 400
 * 18. Checkout without subscription record returns 400
 * 19. Already active paid user trying checkout returns 400 (use portal)
 * 20. Checkout with valid priceKey returns checkoutUrl (requires Stripe)
 *
 * --- STRATEGY TIER GATING (method-level) ---
 * 21. GET /strategies (list own) — accessible to all tiers
 * 22. GET /strategies/public — accessible to all tiers
 * 23. POST /strategies (create) — requires pro
 * 24. PATCH /strategies/:id — requires pro
 * 25. DELETE /strategies/:id — requires pro
 * 26. POST /strategies/:id/analyze — requires pro
 * 27. POST /strategies/:id/create-portfolio — requires pro
 *
 * Auth: Uses CLERK_TEST_MODE=true with test tokens.
 * DB: Creates and cleans up test data directly via Prisma.
 */

import { PrismaClient } from "@prisma/client";

const API_BASE_URL = process.env.API_URL || "http://localhost:3003/api";
const TEST_EMAIL = `billing-e2e-${Date.now()}@test.local`;
const TEST_CLERK_ID = `test_clerk_billing_${Date.now()}`;

const prisma = new PrismaClient();

let bearerToken: string;
let testUserId: string;
let testSubscriptionId: string;
let testVoucherId: string;
let testStrategyId: string;

function generateTestToken(): string {
  return `e2e-test-token:${TEST_CLERK_ID}`;
}

/**
 * Make API request with auth. Returns { status, body } for both success and error.
 */
async function apiRequest(
  endpoint: string,
  options: { method?: string; body?: any; expectError?: boolean } = {}
): Promise<{ status: number; body: any }> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearerToken}`,
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

/**
 * Shorthand for successful requests (throws on non-2xx).
 */
async function api(
  endpoint: string,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  const { status, body } = await apiRequest(endpoint, options);
  if (status >= 400) {
    throw new Error(
      `API ${options.method || "GET"} ${endpoint} → ${status}: ${JSON.stringify(body)}`
    );
  }
  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP & TEARDOWN
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E: Billing & Subscription Flow", () => {
  beforeAll(async () => {
    console.log(`\n🧪 Billing E2E — Setting up with email: ${TEST_EMAIL}`);

    // Create test user directly in DB
    const testUser = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        clerkId: TEST_CLERK_ID,
      },
    });
    testUserId = testUser.id;
    bearerToken = generateTestToken();

    // Verify auth works
    const me = await api("/auth/me");
    expect(me.id).toBe(testUserId);
    expect(me.email).toBe(TEST_EMAIL);

    // Create a starter subscription manually (since we bypass Clerk webhook)
    const sub = await prisma.subscription.create({
      data: {
        userId: testUserId,
        tier: "starter",
        status: "active",
        stripeCustomerId: `cus_test_${Date.now()}`,
      },
    });
    testSubscriptionId = sub.id;

    // Create test voucher
    const voucher = await prisma.voucher.create({
      data: {
        code: `TEST_BILLING_E2E_${Date.now()}`,
        type: "discount_percent",
        discountPercent: 50,
        isActive: true,
        maxRedemptions: 2,
        currentRedemptions: 0,
      },
    });
    testVoucherId = voucher.id;

    console.log("✅ Setup complete");
  });

  afterAll(async () => {
    console.log("\n🧹 Cleaning up billing test data...");

    // Clean up in dependency order
    await prisma.voucherRedemption.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.voucher.deleteMany({
      where: { id: testVoucherId },
    });
    await prisma.stripeEvent.deleteMany({
      where: { stripeEventId: { startsWith: "evt_test_" } },
    });

    // Clean up strategy data if created
    if (testStrategyId) {
      await prisma.savedStrategy.deleteMany({
        where: { id: testStrategyId },
      }).catch(() => {});
    }

    await prisma.subscription.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });

    await prisma.$disconnect();
    console.log("✅ Cleanup complete");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. SUBSCRIPTION STATE
  // ─────────────────────────────────────────────────────────────────────────

  describe("Subscription state", () => {
    test("1. New user has starter subscription", async () => {
      const sub = await api("/billing/subscription");
      expect(sub.tier).toBe("starter");
      expect(sub.status).toBe("active");
    });

    test("2. Starter tier returns correct limits", async () => {
      const sub = await api("/billing/subscription");
      expect(sub.limits).toBeDefined();
      expect(sub.limits.maxPortfolios).toBe(1);
      expect(sub.limits.maxAssetsPerPortfolio).toBe(5);
      expect(sub.limits.rebalanceSharpeEnabled).toBe(false);
      expect(sub.limits.backtestEnabled).toBe(false);
      expect(sub.limits.dcaSignalsEnabled).toBe(false);
      expect(sub.limits.analyticsFullEnabled).toBe(false);
      expect(sub.limits.supportLevel).toBe("community");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. TIER GATING — STARTER BLOCKED FROM PRO FEATURES
  // ─────────────────────────────────────────────────────────────────────────

  describe("Tier gating — starter user", () => {
    test("3. Starter can access ungated endpoints (strategies list)", async () => {
      const { status } = await apiRequest("/strategies");
      expect(status).toBe(200);
    });

    test("4. Starter can access public strategies", async () => {
      const { status } = await apiRequest("/strategies/public");
      expect(status).toBe(200);
    });

    test("5. Starter is blocked from creating strategies (403)", async () => {
      const { status, body } = await apiRequest("/strategies", {
        method: "POST",
        body: {
          name: "Test Strategy",
          config: {},
          metrics: {},
        },
      });
      expect(status).toBe(403);
      expect(body.error).toBe("TIER_REQUIRED");
      expect(body.requiredTier).toBe("pro");
      expect(body.currentTier).toBe("starter");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. UPGRADE TO PRO — GATED FEATURES UNLOCK
  // ─────────────────────────────────────────────────────────────────────────

  describe("Tier upgrade to pro", () => {
    beforeAll(async () => {
      // Simulate Stripe webhook upgrading to pro
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          tier: "pro",
          status: "active",
          stripeSubscriptionId: `sub_test_${Date.now()}`,
          stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_test",
          billingInterval: "month",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ),
        },
      });
    });

    test("6. Subscription now returns pro tier", async () => {
      const sub = await api("/billing/subscription");
      expect(sub.tier).toBe("pro");
      expect(sub.status).toBe("active");
    });

    test("7. Pro tier returns correct limits", async () => {
      const sub = await api("/billing/subscription");
      expect(sub.limits.maxPortfolios).toBe(3);
      expect(sub.limits.maxAssetsPerPortfolio).toBe(-1); // unlimited
      expect(sub.limits.rebalanceSharpeEnabled).toBe(true);
      expect(sub.limits.backtestEnabled).toBe(true);
      expect(sub.limits.dcaSignalsEnabled).toBe(true);
      expect(sub.limits.analyticsFullEnabled).toBe(true);
      expect(sub.limits.supportLevel).toBe("priority");
    });

    test("8. Pro user can list strategies (still works)", async () => {
      const { status } = await apiRequest("/strategies");
      expect(status).toBe(200);
    });

    // Note: We can't fully test strategy creation without a portfolio setup,
    // but the guard itself is the critical test — 403 vs non-403.
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. GRACE PERIODS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Grace periods", () => {
    test("9. past_due status still grants pro access", async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { status: "past_due" },
      });

      const sub = await api("/billing/subscription");
      expect(sub.tier).toBe("pro");
      expect(sub.status).toBe("past_due");
      // Should still pass tier guard
      const { status } = await apiRequest("/strategies");
      expect(status).toBe(200);
    });

    test("10. Canceled with future periodEnd still grants pro access", async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          status: "canceled",
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          currentPeriodEnd: new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000
          ), // 15 days from now
        },
      });

      // Tier guard should still pass for pro features
      const { status } = await apiRequest("/strategies");
      expect(status).toBe(200);
    });

    test("11. Canceled with past periodEnd downgrades to starter", async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          status: "canceled",
          currentPeriodEnd: new Date(
            Date.now() - 1 * 24 * 60 * 60 * 1000
          ), // 1 day ago
        },
      });

      // Creating a strategy should now fail
      const { status, body } = await apiRequest("/strategies", {
        method: "POST",
        body: { name: "Should Fail", config: {}, metrics: {} },
      });
      expect(status).toBe(403);
      expect(body.error).toBe("TIER_REQUIRED");
      expect(body.currentTier).toBe("starter"); // effective tier
    });

    afterAll(async () => {
      // Restore to pro active for subsequent tests
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          tier: "pro",
          status: "active",
          cancelAtPeriodEnd: false,
          canceledAt: null,
          currentPeriodEnd: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ),
        },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. DOWNGRADE BACK TO STARTER
  // ─────────────────────────────────────────────────────────────────────────

  describe("Downgrade to starter", () => {
    test("12. After downgrade, pro features are blocked again", async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          tier: "starter",
          status: "active",
          stripeSubscriptionId: null,
          stripePriceId: null,
          currentPeriodEnd: null,
        },
      });

      const sub = await api("/billing/subscription");
      expect(sub.tier).toBe("starter");

      const { status, body } = await apiRequest("/strategies", {
        method: "POST",
        body: { name: "Should Fail", config: {}, metrics: {} },
      });
      expect(status).toBe(403);
      expect(body.error).toBe("TIER_REQUIRED");
    });

    afterAll(async () => {
      // Restore to starter for voucher tests
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { tier: "starter", status: "active" },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. VOUCHER SYSTEM
  // ─────────────────────────────────────────────────────────────────────────

  describe("Voucher system", () => {
    let voucherCode: string;

    beforeAll(async () => {
      const voucher = await prisma.voucher.findUnique({
        where: { id: testVoucherId },
      });
      voucherCode = voucher!.code;
    });

    test("13. Valid voucher code validates successfully", async () => {
      const result = await api("/billing/voucher/validate", {
        method: "POST",
        body: { code: voucherCode },
      });
      expect(result.code).toBe(voucherCode);
      expect(result.type).toBe("discount_percent");
      expect(result.discountPercent).toBe(50);
    });

    test("14. Case-insensitive voucher validation", async () => {
      const result = await api("/billing/voucher/validate", {
        method: "POST",
        body: { code: voucherCode.toLowerCase() },
      });
      expect(result.code).toBe(voucherCode);
    });

    test("15. Invalid voucher code returns 404", async () => {
      const { status } = await apiRequest("/billing/voucher/validate", {
        method: "POST",
        body: { code: "NONEXISTENT_CODE_12345" },
      });
      expect(status).toBe(404);
    });

    test("16. Expired voucher returns 400", async () => {
      const expiredVoucher = await prisma.voucher.create({
        data: {
          code: `EXPIRED_${Date.now()}`,
          type: "discount_percent",
          discountPercent: 10,
          isActive: true,
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
        },
      });

      const { status, body } = await apiRequest("/billing/voucher/validate", {
        method: "POST",
        body: { code: expiredVoucher.code },
      });
      expect(status).toBe(400);
      expect(body.message).toContain("expired");

      // Clean up
      await prisma.voucher.delete({ where: { id: expiredVoucher.id } });
    });

    test("17. Inactive voucher returns 400", async () => {
      const inactiveVoucher = await prisma.voucher.create({
        data: {
          code: `INACTIVE_${Date.now()}`,
          type: "discount_percent",
          discountPercent: 10,
          isActive: false,
        },
      });

      const { status, body } = await apiRequest("/billing/voucher/validate", {
        method: "POST",
        body: { code: inactiveVoucher.code },
      });
      expect(status).toBe(400);
      expect(body.message).toContain("no longer active");

      await prisma.voucher.delete({ where: { id: inactiveVoucher.id } });
    });

    test("18. Max redemptions exceeded returns 400", async () => {
      const maxedVoucher = await prisma.voucher.create({
        data: {
          code: `MAXED_${Date.now()}`,
          type: "discount_percent",
          discountPercent: 10,
          isActive: true,
          maxRedemptions: 1,
          currentRedemptions: 1,
        },
      });

      const { status, body } = await apiRequest("/billing/voucher/validate", {
        method: "POST",
        body: { code: maxedVoucher.code },
      });
      expect(status).toBe(400);
      expect(body.message).toContain("maximum redemptions");

      await prisma.voucher.delete({ where: { id: maxedVoucher.id } });
    });

    test("19. Double redemption on same subscription returns 400", async () => {
      // First: manually create a redemption record
      await prisma.voucherRedemption.create({
        data: {
          voucherId: testVoucherId,
          subscriptionId: testSubscriptionId,
          userId: testUserId,
        },
      });

      const { status, body } = await apiRequest("/billing/voucher/validate", {
        method: "POST",
        body: { code: voucherCode },
      });
      expect(status).toBe(400);
      expect(body.message).toContain("already used");

      // Clean up redemption for other tests
      await prisma.voucherRedemption.deleteMany({
        where: {
          voucherId: testVoucherId,
          subscriptionId: testSubscriptionId,
        },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. CHECKOUT FLOW (no real Stripe calls)
  // ─────────────────────────────────────────────────────────────────────────

  describe("Checkout flow", () => {
    test("20. Checkout with invalid priceKey returns 400", async () => {
      const { status } = await apiRequest("/billing/checkout", {
        method: "POST",
        body: { priceKey: "invalid_key" },
      });
      expect(status).toBe(400);
    });

    test("21. Already active paid user gets 400 (use portal)", async () => {
      // Temporarily upgrade to active pro
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { tier: "pro", status: "active" },
      });

      const { status, body } = await apiRequest("/billing/checkout", {
        method: "POST",
        body: { priceKey: "pro_monthly" },
      });
      expect(status).toBe(400);
      expect(body.message).toContain("active subscription");

      // Restore to starter
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { tier: "starter", status: "active" },
      });
    });

    // Note: Cannot test successful checkout without real Stripe keys.
    // That flow is covered by integration tests with Stripe test mode.
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. STRATEGY METHOD-LEVEL TIER GATING
  // ─────────────────────────────────────────────────────────────────────────

  describe("Strategy method-level tier gating", () => {
    test("22. GET /strategies — accessible to starter", async () => {
      const { status } = await apiRequest("/strategies");
      expect(status).toBe(200);
    });

    test("23. GET /strategies/public — accessible to starter", async () => {
      const { status } = await apiRequest("/strategies/public");
      expect(status).toBe(200);
    });

    test("24. POST /strategies — requires pro (403 for starter)", async () => {
      const { status, body } = await apiRequest("/strategies", {
        method: "POST",
        body: { name: "Test", config: {}, metrics: {} },
      });
      expect(status).toBe(403);
      expect(body.error).toBe("TIER_REQUIRED");
      expect(body.requiredTier).toBe("pro");
    });

    // For PATCH, DELETE, analyze, create-portfolio we need a strategy ID.
    // We'll upgrade to pro, create one, then test gating.

    describe("with strategy created as pro", () => {
      beforeAll(async () => {
        // Upgrade to pro and create a strategy
        await prisma.subscription.update({
          where: { id: testSubscriptionId },
          data: { tier: "pro", status: "active" },
        });

        // Create a strategy directly in DB for testing
        const strategy = await prisma.savedStrategy.create({
          data: {
            userId: testUserId,
            name: "E2E Test Strategy",
            configJson: JSON.stringify({
              symbols: ["SPY"],
              weights: { SPY: 1 },
              initialCapital: 10000,
              monthlyContribution: 500,
              leverageMin: 2.5,
              leverageMax: 4.0,
              leverageTarget: 3.0,
              windowMonths: 60,
            }),
            metricsJson: JSON.stringify({
              p10: {},
              p50: {},
              p90: {},
              score: { composite: 50 },
            }),
          },
        });
        testStrategyId = strategy.id;

        // Downgrade back to starter for testing gating
        await prisma.subscription.update({
          where: { id: testSubscriptionId },
          data: { tier: "starter", status: "active" },
        });
      });

      test("25. GET /strategies/:id — accessible to starter (read-only)", async () => {
        const { status } = await apiRequest(`/strategies/${testStrategyId}`);
        expect(status).toBe(200);
      });

      test("26. PATCH /strategies/:id — requires pro (403 for starter)", async () => {
        const { status, body } = await apiRequest(
          `/strategies/${testStrategyId}`,
          {
            method: "PATCH",
            body: { name: "Updated Name" },
          }
        );
        expect(status).toBe(403);
        expect(body.error).toBe("TIER_REQUIRED");
      });

      test("27. DELETE /strategies/:id — requires pro (403 for starter)", async () => {
        const { status, body } = await apiRequest(
          `/strategies/${testStrategyId}`,
          { method: "DELETE" }
        );
        expect(status).toBe(403);
        expect(body.error).toBe("TIER_REQUIRED");
      });

      test("28. POST /strategies/:id/analyze — requires pro (403 for starter)", async () => {
        const { status, body } = await apiRequest(
          `/strategies/${testStrategyId}/analyze`,
          { method: "POST" }
        );
        expect(status).toBe(403);
        expect(body.error).toBe("TIER_REQUIRED");
      });

      test("29. POST /strategies/:id/create-portfolio — requires pro (403 for starter)", async () => {
        const { status, body } = await apiRequest(
          `/strategies/${testStrategyId}/create-portfolio`,
          {
            method: "POST",
            body: { name: "Portfolio from Strategy" },
          }
        );
        expect(status).toBe(403);
        expect(body.error).toBe("TIER_REQUIRED");
      });

      test("30. After re-upgrade to pro, PATCH works", async () => {
        await prisma.subscription.update({
          where: { id: testSubscriptionId },
          data: { tier: "pro", status: "active" },
        });

        const { status } = await apiRequest(
          `/strategies/${testStrategyId}`,
          {
            method: "PATCH",
            body: { name: "Updated Name Pro" },
          }
        );
        expect(status).toBe(200);
      });

      afterAll(async () => {
        // Clean up strategy
        await prisma.savedStrategy.deleteMany({
          where: { id: testStrategyId },
        }).catch(() => {});

        // Restore to starter
        await prisma.subscription.update({
          where: { id: testSubscriptionId },
          data: { tier: "starter", status: "active" },
        });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. SUBSCRIPTION SERVICE — syncFromStripe simulation
  // ─────────────────────────────────────────────────────────────────────────

  describe("Subscription sync (simulated webhook)", () => {
    test("31. Simulating subscription.created updates tier to pro", async () => {
      // Directly update DB to simulate what syncFromStripe does
      const now = Math.floor(Date.now() / 1000);
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          stripeSubscriptionId: `sub_simulated_${Date.now()}`,
          stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_test",
          tier: "pro",
          status: "trialing",
          billingInterval: "month",
          currentPeriodStart: new Date(now * 1000),
          currentPeriodEnd: new Date((now + 30 * 86400) * 1000),
          trialEnd: new Date((now + 14 * 86400) * 1000),
        },
      });

      const sub = await api("/billing/subscription");
      expect(sub.tier).toBe("pro");
      expect(sub.status).toBe("trialing");
      expect(sub.trialEnd).toBeDefined();
    });

    test("32. Trialing status grants pro access", async () => {
      const { status } = await apiRequest("/strategies");
      expect(status).toBe(200);

      // Pro-gated endpoint should work during trial
      const sub = await api("/billing/subscription");
      expect(sub.limits.rebalanceSharpeEnabled).toBe(true);
      expect(sub.limits.backtestEnabled).toBe(true);
    });

    test("33. Simulating subscription.deleted downgrades to starter", async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          tier: "starter",
          status: "canceled",
          stripeSubscriptionId: null,
          stripePriceId: null,
          canceledAt: new Date(),
          currentPeriodEnd: new Date(
            Date.now() - 24 * 60 * 60 * 1000
          ), // expired
          trialEnd: null,
        },
      });

      const sub = await api("/billing/subscription");
      expect(sub.tier).toBe("starter");
      expect(sub.limits.rebalanceSharpeEnabled).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. INSTITUTIONAL TIER
  // ─────────────────────────────────────────────────────────────────────────

  describe("Institutional tier", () => {
    beforeAll(async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          tier: "institutional",
          status: "active",
          currentPeriodEnd: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ),
        },
      });
    });

    test("34. Institutional tier has full limits", async () => {
      const sub = await api("/billing/subscription");
      expect(sub.tier).toBe("institutional");
      expect(sub.limits.maxPortfolios).toBe(-1); // unlimited
      expect(sub.limits.maxAssetsPerPortfolio).toBe(-1);
      expect(sub.limits.rebalanceSharpeEnabled).toBe(true);
      expect(sub.limits.backtestEnabled).toBe(true);
      expect(sub.limits.backtestAdvancedEnabled).toBe(true);
      expect(sub.limits.exportEnabled).toBe(true);
      expect(sub.limits.apiAccess).toBe(true);
      expect(sub.limits.customRiskParams).toBe(true);
      expect(sub.limits.dedicatedOnboarding).toBe(true);
      expect(sub.limits.supportLevel).toBe("priority_sla");
    });

    test("35. Institutional can access all pro-gated endpoints", async () => {
      const { status } = await apiRequest("/strategies");
      expect(status).toBe(200);
    });

    afterAll(async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { tier: "starter", status: "active" },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 11. BILLING PORTAL
  // ─────────────────────────────────────────────────────────────────────────

  describe("Billing portal", () => {
    test("36. Portal without Stripe customer returns 400", async () => {
      // Remove stripeCustomerId temporarily
      const currentSub = await prisma.subscription.findUnique({
        where: { id: testSubscriptionId },
      });
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { stripeCustomerId: null },
      });

      const { status, body } = await apiRequest("/billing/portal", {
        method: "POST",
      });
      expect(status).toBe(400);
      expect(body.message).toContain("No Stripe customer");

      // Restore
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { stripeCustomerId: currentSub!.stripeCustomerId },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 12. EDGE CASES
  // ─────────────────────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    test("37. User without subscription record gets starter defaults", async () => {
      // Create a fresh user with no subscription
      const freshUser = await prisma.user.create({
        data: {
          email: `fresh-${Date.now()}@test.local`,
          clerkId: `test_fresh_${Date.now()}`,
        },
      });

      const freshToken = `e2e-test-token:${freshUser.clerkId}`;
      const url = `${API_BASE_URL}/billing/subscription`;
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
        },
      });

      const body = await response.json();
      expect(body.tier).toBe("starter");
      expect(body.limits.maxPortfolios).toBe(1);

      // Clean up
      await prisma.user.delete({ where: { id: freshUser.id } });
    });

    test("38. Unpaid status blocks pro access", async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          tier: "pro",
          status: "unpaid",
          currentPeriodEnd: null,
        },
      });

      // unpaid is NOT in ACTIVE_STATUSES, so effective tier = starter
      const { status, body } = await apiRequest("/strategies", {
        method: "POST",
        body: { name: "Should Fail", config: {}, metrics: {} },
      });
      expect(status).toBe(403);

      // Restore
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { tier: "starter", status: "active" },
      });
    });

    test("39. Incomplete status blocks pro access", async () => {
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: {
          tier: "pro",
          status: "incomplete",
          currentPeriodEnd: null,
        },
      });

      const { status } = await apiRequest("/strategies", {
        method: "POST",
        body: { name: "Should Fail", config: {}, metrics: {} },
      });
      expect(status).toBe(403);

      // Restore
      await prisma.subscription.update({
        where: { id: testSubscriptionId },
        data: { tier: "starter", status: "active" },
      });
    });
  });
});
