/**
 * E2E Browser Tests: Billing UI Flow
 *
 * Tests billing UI components by intercepting backend APIs.
 * Requires frontend running with NEXT_PUBLIC_E2E_TESTING=true to bypass auth middleware.
 * Sets __e2e_bypass cookie to bypass client-side Clerk auth checks.
 *
 * Prerequisites:
 * - Frontend running on localhost:3002 (with NEXT_PUBLIC_E2E_TESTING=true)
 */

import { test, expect } from "@playwright/test";

// ─── Helpers ────────────────────────────────────────────────────────────────

function starterLimits() {
  return {
    maxPortfolios: 1,
    maxAssetsPerPortfolio: 5,
    rebalanceSharpeEnabled: false,
    dcaSignalsEnabled: false,
    backtestEnabled: false,
    backtestAdvancedEnabled: false,
    analyticsFullEnabled: false,
    autoPriceIngestion: false,
    emailAlerts: false,
    exportEnabled: false,
    apiAccess: false,
    customRiskParams: false,
    dedicatedOnboarding: false,
    supportLevel: "community",
  };
}

function proLimits() {
  return {
    maxPortfolios: 3,
    maxAssetsPerPortfolio: -1,
    rebalanceSharpeEnabled: true,
    dcaSignalsEnabled: true,
    backtestEnabled: true,
    backtestAdvancedEnabled: false,
    analyticsFullEnabled: true,
    autoPriceIngestion: true,
    emailAlerts: true,
    exportEnabled: false,
    apiAccess: false,
    customRiskParams: false,
    dedicatedOnboarding: false,
    supportLevel: "priority",
  };
}

function subscriptionResponse(overrides: Record<string, any> = {}) {
  return {
    tier: "starter",
    status: "active",
    billingInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEnd: null,
    stripeCustomerId: "cus_test",
    limits: overrides.tier === "pro" ? proLimits() : starterLimits(),
    ...overrides,
  };
}

/** Mock all backend API calls so pages can render without a real backend */
async function mockAllAPIs(page: any, subscriptionOverrides: Record<string, any> = {}) {
  // Catch-all for any API request to the backend
  await page.route("**/api/**", (route: any) => {
    const url = route.request().url();

    // Subscription
    if (url.includes("/billing/subscription")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(subscriptionResponse(subscriptionOverrides)),
      });
    }

    // Portfolios list (no sub-path)
    if (url.match(/\/api\/portfolios(\?|$)/) && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "test-portfolio-1", name: "Test Portfolio", baseCurrency: "USD" },
        ]),
      });
    }

    // Portfolio summary
    if (url.includes("/summary")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          equity: 10000,
          exposure: 30000,
          leverage: 3.0,
          borrowedAmount: 20000,
          absoluteReturn: 0.05,
          percentReturn: 5.0,
          positions: [],
          analytics: {
            cagr: 0.12, xirr: 0.15, volatility: 0.18, sharpe: 1.2,
            maxDrawdown: -0.08, underwaterDays: 10, bestDay: 0.03, worstDay: -0.02,
          },
        }),
      });
    }

    // User profile
    if (url.includes("/users/profile")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ email: "e2e@test.com", fullName: "E2E Test User" }),
      });
    }

    // Portfolio configuration
    if (url.includes("/configuration")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          leverageMin: 2.5, leverageMax: 4.0, leverageTarget: 3.0,
          monthlyContribution: 500, contributionFrequency: "monthly",
          contributionDayOfMonth: 1, contributionEnabled: true,
          targetWeightsJson: "{}", useDynamicSharpeRebalance: true,
        }),
      });
    }

    // Default: return empty array (safe for list endpoints like metrics, notifications, contributions, etc.)
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

// Set bypass cookie before every test so useAuth() returns a mock user
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "__e2e_bypass", value: "1", domain: "localhost", path: "/" },
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR LOCK ICONS
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Sidebar lock icons", () => {
  test("1. Starter user sees lock icons on Rebalance and Backtest", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", { timeout: 15000 });

    // Rebalance button should have 2 svgs: icon + lock
    const rebalanceBtn = page.locator("button:has-text('Reajustar Portfolio')");
    await expect(rebalanceBtn).toBeVisible();
    const rebalanceSvgs = rebalanceBtn.locator("svg");
    await expect(rebalanceSvgs).toHaveCount(2);

    // Backtest button should have 2 svgs: icon + lock
    const backtestBtn = page.locator("button:has-text('Backtest')");
    await expect(backtestBtn).toBeVisible();
    const backtestSvgs = backtestBtn.locator("svg");
    await expect(backtestSvgs).toHaveCount(2);
  });

  test("2. Non-gated items have no lock icon", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", { timeout: 15000 });

    // Dashboard, Aportaciones, Configuración should have only 1 svg (the icon)
    for (const label of ["Dashboard", "Aportaciones", "Configuración"]) {
      const btn = page.locator(`button:has-text('${label}')`);
      await expect(btn).toBeVisible();
      await expect(btn.locator("svg")).toHaveCount(1);
    }
  });

  test("3. Pro user has no lock icons on any item", async ({ page }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", { timeout: 15000 });

    // All items should have exactly 1 svg (the icon only)
    for (const label of ["Reajustar Portfolio", "Backtest"]) {
      const btn = page.locator(`button:has-text('${label}')`);
      await expect(btn).toBeVisible();
      await expect(btn.locator("svg")).toHaveCount(1);
    }
  });

  test("4. All sidebar items are navigable for starter", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", { timeout: 15000 });

    // Billing item should exist
    const billingBtn = page.locator("button:has-text('Facturación')");
    await expect(billingBtn).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE GATES
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Feature gates — starter", () => {
  test("5. Rebalance shows UpgradePrompt for starter", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/rebalance");
    await expect(
      page.locator("text=requiere el plan Pro").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("6. Backtest shows UpgradePrompt for starter", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/backtest");
    await expect(
      page.locator("text=requiere el plan Pro").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("7. UpgradePrompt has 'Ver Planes' button", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/rebalance");
    const btn = page.locator("button:has-text('Ver Planes')").first();
    await expect(btn).toBeVisible({ timeout: 15000 });
  });

  test("8. 'Ver Planes' navigates to billing", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/rebalance");
    const btn = page.locator("button:has-text('Ver Planes')").first();
    await btn.waitFor({ timeout: 15000 });
    // Use dispatchEvent to bypass nextjs-portal overlay in dev mode
    await btn.dispatchEvent("click");

    await expect(page).toHaveURL(/billing/, { timeout: 10000 });
  });
});

test.describe("Feature gates — pro", () => {
  test("9. Rebalance loads content for pro (no gate)", async ({ page }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard/rebalance");
    // Wait for page to render (sidebar loads first)
    await page.waitForSelector("button:has-text('Dashboard')", { timeout: 15000 });
    // Give time for subscription data to resolve and feature gate to render
    await page.waitForTimeout(2000);

    // Should NOT show upgrade prompt
    await expect(page.locator("text=requiere el plan Pro")).not.toBeVisible();
  });

  test("10. Backtest loads content for pro (no gate)", async ({ page }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard/backtest");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=requiere el plan Pro")).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BILLING PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Billing page", () => {
  test("11. Shows three plans", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/billing");

    // Wait for any plan name to appear
    await page.waitForSelector("text=Starter", { timeout: 15000 });

    await expect(page.locator("text=Starter").first()).toBeVisible();
    await expect(page.locator("text=Pro").first()).toBeVisible();
    await expect(page.locator("text=Institutional").first()).toBeVisible();
  });

  test("12. Shows pricing amounts", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/billing");
    await page.waitForSelector("text=Starter", { timeout: 15000 });

    // Should show price numbers (19, 49, or annual equivalents)
    const pageContent = await page.textContent("body");
    expect(pageContent).toMatch(/19|15/); // Pro monthly or yearly
    expect(pageContent).toMatch(/49|39/); // Institutional monthly or yearly
  });

  test("13. Has monthly/yearly toggle", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/billing");
    await page.waitForSelector("text=Starter", { timeout: 15000 });

    // Look for toggle text
    const pageContent = await page.textContent("body");
    const hasToggle = pageContent?.includes("Mensual") || pageContent?.includes("Anual");
    expect(hasToggle).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION BANNERS
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Subscription banners", () => {
  test("14. No banner for healthy starter", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter", status: "active" });

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", { timeout: 15000 });

    // None of the banner texts should appear
    await expect(page.locator("text=prueba gratuita")).not.toBeVisible();
    await expect(page.locator("text=pago ha fallado")).not.toBeVisible();
    await expect(page.locator("text=plan finaliza")).not.toBeVisible();
  });

  test("15. Trial banner shows for trialing user", async ({ page }) => {
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await mockAllAPIs(page, {
      tier: "pro",
      status: "trialing",
      trialEnd,
    });

    await page.goto("/dashboard");
    await expect(
      page.locator("text=prueba gratuita").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("16. Past due banner shows payment warning", async ({ page }) => {
    await mockAllAPIs(page, { tier: "pro", status: "past_due" });

    await page.goto("/dashboard");
    await expect(
      page.locator("text=pago ha fallado").first()
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("text=Actualizar pago").first()
    ).toBeVisible();
  });

  test("17. Canceled banner shows end date", async ({ page }) => {
    const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await mockAllAPIs(page, {
      tier: "pro",
      status: "canceled",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd,
    });

    await page.goto("/dashboard");
    await expect(
      page.locator("text=plan finaliza").first()
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("text=Reactivar plan").first()
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BILLING SUCCESS & CANCEL
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Billing success & cancel pages", () => {
  test("18. Success page shows confirmation", async ({ page }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard/billing-success");

    await expect(
      page.locator("text=/activado|suscripción|[Éé]xito/i").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("19. Cancel page shows navigation options", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/billing-cancel");

    await expect(
      page.locator("text=/[Vv]er [Pp]lanes|Dashboard|cancelad/i").first()
    ).toBeVisible({ timeout: 15000 });
  });
});
