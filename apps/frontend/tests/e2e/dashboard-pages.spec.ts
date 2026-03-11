/**
 * E2E Browser Tests: Dashboard Pages
 *
 * Tests all non-billing dashboard pages by intercepting backend APIs.
 * Requires frontend running with NEXT_PUBLIC_E2E_TESTING=true to bypass auth middleware.
 * Sets __e2e_bypass cookie to bypass client-side Clerk auth checks.
 *
 * Prerequisites:
 * - Frontend running on localhost:3002 (with NEXT_PUBLIC_E2E_TESTING=true)
 */

import { test, expect } from "@playwright/test";

// ─── Mock Data ──────────────────────────────────────────────────────────────

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

function mockPortfolioList() {
  return [
    { id: "test-portfolio-1", name: "Test Portfolio", baseCurrency: "USD" },
  ];
}

function mockSummary() {
  return {
    portfolio: {
      id: "test-portfolio-1",
      name: "Test Portfolio",
      leverageMin: 2.5,
      leverageMax: 4.0,
    },
    metrics: {
      equity: 50000,
      exposure: 150000,
      leverage: 3.0,
      totalContributions: 10000,
      totalWithdrawn: 0,
      absoluteReturn: 5000,
      percentReturn: 10,
      twr: 0.12,
      startDate: "2024-01-01",
      lastUpdate: "2025-03-10",
    },
    positions: [
      {
        asset: {
          id: "a1",
          symbol: "SPY",
          name: "S&P 500",
          assetType: "index",
        },
        quantity: 100,
        avgPrice: 400,
        currentPrice: 450,
        exposureUsd: 45000,
        pnl: 5000,
        pnlPercent: 12.5,
        weight: 0.3,
      },
      {
        asset: {
          id: "a2",
          symbol: "GLD",
          name: "SPDR Gold",
          assetType: "commodity",
        },
        quantity: 50,
        avgPrice: 180,
        currentPrice: 200,
        exposureUsd: 10000,
        pnl: 1000,
        pnlPercent: 11.1,
        weight: 0.067,
      },
    ],
    analytics: {
      capitalFinal: 50000,
      totalInvested: 45000,
      totalWithdrawn: 0,
      absoluteReturn: 5000,
      totalReturnPercent: 11.1,
      twr: 0.12,
      cagr: 0.12,
      xirr: 0.15,
      volatility: 0.18,
      sharpe: 1.2,
      maxDrawdownEquity: -0.08,
      maxDrawdownExposure: -0.12,
      underwaterDays: 10,
      bestDay: { date: "2024-06-01", return: 0.03 },
      worstDay: { date: "2024-03-15", return: -0.02 },
    },
  };
}

function mockNotifications() {
  return {
    portfolioId: "test-portfolio-1",
    portfolioName: "Test",
    timestamp: new Date().toISOString(),
    currentState: {
      equity: 50000,
      exposure: 150000,
      leverage: 3.0,
      marginRatio: 0.33,
      peakEquity: 52000,
      pendingContributions: 0,
      positionValues: {},
      positionQuantities: {},
    },
    configuration: {
      leverageMin: 2.5,
      leverageMax: 4.0,
      leverageTarget: 3.0,
      monthlyContribution: 1000,
      contributionDayOfMonth: 1,
      targetWeights: {},
    },
    conditions: {
      drawdown: -0.04,
      drawdownTriggered: false,
      weightDeviation: 0.02,
      weightDeviationTriggered: false,
      volatility: 0.15,
      volatilityTriggered: false,
      anyConditionTriggered: false,
      deployFraction: 0,
    },
    notifications: [],
    isContributionDay: false,
    nextContributionDate: null,
    summary: {
      leverageStatus: "in_range",
      attentionRequired: false,
      primaryNotification: null,
    },
  };
}

function mockContributionHistory() {
  return [
    {
      id: "c1",
      amount: 1000,
      type: "contribution",
      contributedAt: "2024-06-01T00:00:00Z",
      note: "Monthly DCA",
      deployed: true,
      deployedAmount: 1000,
      deploymentReason: "manual",
    },
  ];
}

function mockConfiguration() {
  return {
    id: "test-portfolio-1",
    name: "Test Portfolio",
    monthlyContribution: 1000,
    contributionFrequency: "monthly",
    contributionDayOfMonth: 1,
    contributionEnabled: true,
    leverageMin: 2.5,
    leverageMax: 4.0,
    leverageTarget: 3.0,
    initialCapital: 10000,
    maintenanceMarginRatio: 0.05,
    safeMarginRatio: 0.15,
    criticalMarginRatio: 0.1,
    drawdownRedeployThreshold: 0.12,
    weightDeviationThreshold: 0.05,
    volatilityLookbackDays: 63,
    volatilityRedeployThreshold: 0.18,
    gradualDeployFactor: 0.5,
    useDynamicSharpeRebalance: true,
    sharpeWeightsLookbackMonths: 0,
    meanReturnShrinkage: 0.6,
    riskFreeRate: 0.02,
    maxWeight: 0.4,
    minWeight: 0.05,
    targetWeights: { SPY: 0.6, GLD: 0.25, "BTC-USD": 0.15 },
    riskProfile: "moderate",
    riskProfileName: "Moderado",
  };
}

function mockProfile() {
  return {
    id: "u1",
    email: "e2e@test.com",
    fullName: "E2E Test User",
    avatarUrl: null,
    notifyOnNotifications: true,
    notifyOnContributions: true,
    notifyOnLeverageAlerts: true,
    notifyOnRebalance: true,
    createdAt: "2024-01-01",
    updatedAt: "2025-03-10",
  };
}

function mockMetrics() {
  return [
    {
      date: "2024-06-01",
      equity: 48000,
      exposure: 144000,
      leverage: 3.0,
      drawdown: -0.04,
    },
    {
      date: "2024-07-01",
      equity: 50000,
      exposure: 150000,
      leverage: 3.0,
      drawdown: 0,
    },
  ];
}

function mockTargetAssets() {
  return [
    {
      id: "ta1",
      symbol: "SPY",
      name: "S&P 500",
      assetType: "index",
      targetWeight: 0.6,
      enabled: true,
      hasPosition: true,
      currentQuantity: 100,
      currentValue: 45000,
    },
  ];
}

function mockRebalanceSimulation() {
  return {
    currentEquity: 50000,
    currentExposure: 150000,
    currentLeverage: 3.0,
    targetLeverage: 3.0,
    targetExposure: 150000,
    deployFraction: 0,
    deploySignals: {
      drawdownTriggered: false,
      weightDeviationTriggered: false,
      volatilityTriggered: false,
    },
    drawdown: -0.04,
    peakEquity: 52000,
    weightDeviation: 0.02,
    realizedVolatility: 0.15,
    pendingContribution: 0,
    positions: [
      {
        assetId: "a1",
        assetSymbol: "SPY",
        assetName: "S&P 500",
        assetType: "index",
        currentQuantity: 100,
        currentValue: 45000,
        targetQuantity: 100,
        targetValue: 45000,
        deltaQuantity: 0,
        deltaValue: 0,
        targetWeight: 0.6,
        currentWeight: 0.6,
        currentPrice: 450,
        action: "HOLD",
      },
    ],
    summary: {
      newEquity: 50000,
      newExposure: 150000,
      newLeverage: 3.0,
      equityUsedFromContribution: 0,
      borrowIncrease: 0,
    },
    weightsUsed: { SPY: 0.6 },
    dynamicWeightsComputed: true,
  };
}

function mockRiskProfiles() {
  return [
    {
      id: "conservative",
      name: "Conservador",
      nameEn: "Conservative",
      icon: "shield",
      description: "Perfil de bajo riesgo con leverage moderado.",
      shortDescription: "Bajo riesgo",
      riskLevel: 1,
      params: {
        leverageMin: 1.5,
        leverageMax: 2.5,
        leverageTarget: 2.0,
        maintenanceMarginRatio: 0.05,
        meanReturnShrinkage: 0.7,
        maxWeight: 0.5,
        minWeight: 0.1,
        windowMonths: 24,
      },
      suitableFor: ["Inversores conservadores"],
      notSuitableFor: ["Inversores agresivos"],
    },
    {
      id: "moderate",
      name: "Moderado",
      nameEn: "Moderate",
      icon: "scale",
      description: "Perfil de riesgo medio con leverage equilibrado.",
      shortDescription: "Riesgo medio",
      riskLevel: 2,
      params: {
        leverageMin: 2.5,
        leverageMax: 4.0,
        leverageTarget: 3.0,
        maintenanceMarginRatio: 0.05,
        meanReturnShrinkage: 0.6,
        maxWeight: 0.4,
        minWeight: 0.05,
        windowMonths: 0,
      },
      suitableFor: ["Inversores equilibrados"],
      notSuitableFor: ["Muy conservadores"],
    },
  ];
}

// ─── API Mocking ────────────────────────────────────────────────────────────

/** Mock all backend API calls so pages can render without a real backend */
async function mockAllAPIs(
  page: any,
  subscriptionOverrides: Record<string, any> = {}
) {
  await page.route("**/api/**", (route: any) => {
    const url = route.request().url();
    const method = route.request().method();

    // Subscription
    if (url.includes("/billing/subscription")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(subscriptionResponse(subscriptionOverrides)),
      });
    }

    // Risk profiles
    if (url.includes("/risk-profiles")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRiskProfiles()),
      });
    }

    // Portfolios list (no sub-path)
    if (url.match(/\/api\/portfolios(\?|$)/) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPortfolioList()),
      });
    }

    // Rebalance simulation
    if (url.includes("/rebalance/simulation")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRebalanceSimulation()),
      });
    }

    // Target assets
    if (url.includes("/target-assets")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTargetAssets()),
      });
    }

    // Portfolio configuration
    if (url.includes("/configuration")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockConfiguration()),
      });
    }

    // Portfolio notifications
    if (url.includes("/notifications")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockNotifications()),
      });
    }

    // Contribution history
    if (url.includes("/contributions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContributionHistory()),
      });
    }

    // Portfolio summary
    if (url.includes("/summary")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSummary()),
      });
    }

    // Portfolio metrics
    if (url.includes("/metrics")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMetrics()),
      });
    }

    // User profile
    if (url.includes("/users/profile")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockProfile()),
      });
    }

    // Strategies
    if (url.includes("/strategies")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Default: return empty array (safe for list endpoints)
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

/**
 * Dismiss the Next.js dev mode error overlay if it appears.
 * This overlay can appear due to hydration mismatches in dev mode
 * and is not related to our tests.
 */
async function dismissNextDevOverlay(page: any) {
  try {
    // Wait briefly for the overlay to potentially appear
    const closeButton = page.locator(
      'nextjs-portal button[aria-label="Close"]'
    );
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
    }
  } catch {
    // Overlay not present, continue
  }
}

// Set bypass cookie before every test so useAuth() returns a mock user
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "__e2e_bypass", value: "1", domain: "localhost", path: "/" },
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard page", () => {
  test("1. Renders equity metric card", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard");
    // Wait for the dashboard to load
    await page.waitForSelector("button:has-text('Dashboard')", {
      timeout: 15000,
    });

    // Dismiss Next.js dev overlay if it appears (hydration mismatch in dev mode)
    await dismissNextDevOverlay(page);

    // The dashboard displays "Equity" as a metric card title
    await expect(page.locator("text=Equity").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("2. Renders exposure metric card", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", {
      timeout: 15000,
    });

    await expect(
      page.locator("text=/Exposici[oó]n/").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("3. Renders leverage metric card", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", {
      timeout: 15000,
    });

    await expect(
      page.locator("text=Apalancamiento").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("4. Shows positions table with asset data", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", {
      timeout: 15000,
    });

    // The dashboard shows a "Posiciones Actuales" section
    await expect(
      page.locator("text=Posiciones Actuales").first()
    ).toBeVisible({ timeout: 10000 });

    // Should show the SPY position from mock data
    await expect(page.locator("text=SPY").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("5. Shows analytics section with CAGR and Sharpe", async ({
    page,
  }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", {
      timeout: 15000,
    });

    // Analytics section should display CAGR and Sharpe labels
    await expect(page.locator("text=CAGR").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator("text=Sharpe Ratio").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("6. Shows equity chart section", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard");
    await page.waitForSelector("button:has-text('Dashboard')", {
      timeout: 15000,
    });

    await expect(
      page.locator("text=Historial de Equity").first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRIBUTION PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Contribution page", () => {
  test("7. Renders contribution form with amount input", async ({
    page,
  }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/contribution");

    // Wait for the page header
    await expect(
      page.locator("text=Aportaciones y Retiros").first()
    ).toBeVisible({ timeout: 15000 });

    // The form should have an amount label
    await expect(
      page
        .locator("text=/Cantidad de Aportaci[oó]n/")
        .first()
    ).toBeVisible();
  });

  test("8. Has contribution/withdrawal toggle", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/contribution");

    await expect(
      page.locator("text=Aportaciones y Retiros").first()
    ).toBeVisible({ timeout: 15000 });

    // Toggle buttons should exist
    await expect(
      page.locator("button:has-text('Aportaci')").first()
    ).toBeVisible();
    await expect(
      page.locator("button:has-text('Retiro')").first()
    ).toBeVisible();
  });

  test("9. Has note field and submit button", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/contribution");

    await expect(
      page.locator("text=Aportaciones y Retiros").first()
    ).toBeVisible({ timeout: 15000 });

    // Note label
    await expect(
      page.locator("text=Nota (opcional)").first()
    ).toBeVisible();

    // Submit button
    await expect(
      page
        .locator("button:has-text('Registrar Aportaci')")
        .first()
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL UPDATE PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Manual Update page", () => {
  test("10. Shows position editor with equity input", async ({
    page,
  }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/manual-update");

    // Wait for page to load
    await expect(
      page.locator("text=Sincronizar Posiciones").first()
    ).toBeVisible({ timeout: 15000 });

    // Should show "Equity Actual" section
    await expect(
      page.locator("text=Equity Actual").first()
    ).toBeVisible();

    // Should show "Posiciones Actuales" section
    await expect(
      page.locator("text=Posiciones Actuales").first()
    ).toBeVisible();
  });

  test("11. Shows position data from mock", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/manual-update");

    await expect(
      page.locator("text=Sincronizar Posiciones").first()
    ).toBeVisible({ timeout: 15000 });

    // The SPY position label should be visible (shows asset name + symbol)
    await expect(page.locator("text=SPY").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("12. Has add asset and save buttons", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/manual-update");

    await expect(
      page.locator("text=Sincronizar Posiciones").first()
    ).toBeVisible({ timeout: 15000 });

    // Add asset button
    await expect(
      page.locator("button:has-text('Añadir Activo')").first()
    ).toBeVisible();

    // Save button
    await expect(
      page
        .locator("button:has-text('Guardar Estado Actual')")
        .first()
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REBALANCE PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Rebalance page", () => {
  test("13. Shows UpgradePrompt for starter user", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/rebalance");
    await expect(
      page.locator("text=requiere el plan Pro").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("14. Shows simulation content for pro user", async ({ page }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard/rebalance");

    // Wait for page to render
    await page.waitForSelector("button:has-text('Dashboard')", { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Should NOT show upgrade prompt
    await expect(
      page.locator("text=requiere el plan Pro")
    ).not.toBeVisible();

    // Should show the rebalance page header
    await expect(
      page.locator("text=Reajuste de Portfolio").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("15. Shows current vs target state for pro user", async ({
    page,
  }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard/rebalance");

    // The page shows AHORA vs DESPUES sections
    await expect(page.locator("text=AHORA").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator("text=/DESPU[EÉ]S DEL REAJUSTE/").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("16. Shows position adjustments for pro user", async ({
    page,
  }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard/rebalance");

    // Should show the adjustments section
    await expect(
      page.locator("text=Ajustes Calculados").first()
    ).toBeVisible({ timeout: 15000 });

    // Should show SPY position
    await expect(page.locator("text=SPY").first()).toBeVisible({
      timeout: 10000,
    });

    // Should show HOLD action (all positions are balanced in mock)
    await expect(page.locator("text=HOLD").first()).toBeVisible({
      timeout: 10000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuration page", () => {
  test("17. Shows configuration page header", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/configuration");

    await expect(
      page
        .locator("text=/Configuraci[oó]n del Portfolio/")
        .first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("18. Shows risk profile selector section", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/configuration");

    await expect(
      page
        .locator("text=/Configuraci[oó]n del Portfolio/")
        .first()
    ).toBeVisible({ timeout: 15000 });

    // Should show risk profile section (leverage range is only visible for custom profile)
    await expect(
      page.locator("text=Perfil de Riesgo").first()
    ).toBeVisible({ timeout: 10000 });

    // Should show the predefined profiles from mock
    await expect(
      page.locator("text=Conservador").first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("text=Moderado").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("19. Shows contribution settings section", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/configuration");

    await expect(
      page
        .locator("text=/Configuraci[oó]n del Portfolio/")
        .first()
    ).toBeVisible({ timeout: 15000 });

    // Should show contribution settings
    await expect(
      page.locator("text=Aportaciones Habilitadas").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("20. Shows weight allocation section", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/configuration");

    await expect(
      page
        .locator("text=/Configuraci[oó]n del Portfolio/")
        .first()
    ).toBeVisible({ timeout: 15000 });

    // Should show weight allocation section
    await expect(
      page
        .locator("text=/Asignaci[oó]n de Pesos/")
        .first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Backtest page", () => {
  test("21. Shows UpgradePrompt for starter user", async ({ page }) => {
    await mockAllAPIs(page, { tier: "starter" });

    await page.goto("/dashboard/backtest");
    await expect(
      page.locator("text=requiere el plan Pro").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("22. Shows backtest content for pro user (no gate)", async ({
    page,
  }) => {
    await mockAllAPIs(page, { tier: "pro" });

    await page.goto("/dashboard/backtest");
    await page.waitForLoadState("networkidle");

    // Should NOT show upgrade prompt
    await expect(
      page.locator("text=requiere el plan Pro")
    ).not.toBeVisible();

    // Should show the backtest page header
    await expect(
      page.locator("text=Backtest Historico").first()
    ).toBeVisible({ timeout: 15000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Profile page", () => {
  test("23. Shows user info section", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/profile");

    // Wait for profile page header
    await expect(
      page.locator("text=Mi Perfil").first()
    ).toBeVisible({ timeout: 15000 });

    // Should show personal info section
    await expect(
      page
        .locator("text=/Informaci[oó]n Personal/")
        .first()
    ).toBeVisible({ timeout: 10000 });

    // Should show email field with mock data
    await expect(
      page.locator("input[value='e2e@test.com']").first()
    ).toBeVisible();
  });

  test("24. Shows notification preferences", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/profile");

    await expect(
      page.locator("text=Mi Perfil").first()
    ).toBeVisible({ timeout: 15000 });

    // Should show notification preferences section
    await expect(
      page
        .locator("text=Preferencias de Notificaciones")
        .first()
    ).toBeVisible({ timeout: 10000 });

    // Should show specific notification checkboxes
    await expect(
      page.locator("text=Notificaciones de Estado").first()
    ).toBeVisible();
    await expect(
      page.locator("text=Alertas de Leverage").first()
    ).toBeVisible();
  });

  test("25. Shows subscription section", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/profile");

    await expect(
      page.locator("text=Mi Perfil").first()
    ).toBeVisible({ timeout: 15000 });

    // Should show subscription section
    await expect(
      page
        .locator("text=/Suscripci[oó]n/")
        .first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HELP PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Help page", () => {
  test("26. Renders help page content", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/help");

    // Wait for help page header
    await expect(
      page.locator("text=/Gu[ií]a de Ayuda/").first()
    ).toBeVisible({ timeout: 15000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGIES PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Strategies page", () => {
  test("27. Renders strategies page with tabs", async ({ page }) => {
    await mockAllAPIs(page);

    await page.goto("/dashboard/strategies");

    // Wait for the strategies page header
    await expect(
      page.locator("text=Estrategias").first()
    ).toBeVisible({ timeout: 15000 });

    // Should show "Mis Estrategias" tab
    await expect(
      page.locator("text=Mis Estrategias").first()
    ).toBeVisible({ timeout: 10000 });
  });
});
