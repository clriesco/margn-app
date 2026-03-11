import { test, expect } from "@playwright/test";
import {
  mockAdminAPIs,
  setBypassCookie,
  MOCK_STATS,
  MOCK_ACTIVITY,
} from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await setBypassCookie(context);
  });

  test("C1: shows loading state before data loads", async ({ page }) => {
    // Delay API responses so loading state is visible
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_STATS),
      });
    });

    // Don't await full load — we want to catch the loading state
    page.goto("/");
    await expect(page.getByText("Cargando...")).toBeVisible({ timeout: 3000 });
  });

  test("C2: renders 4 stat cards with correct labels", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/");
    await page.waitForSelector("text=142", { timeout: 10000 });

    await expect(page.getByText("Suscriptores Pro")).toBeVisible();
    await expect(page.getByText("MRR")).toBeVisible();
    await expect(page.getByText("142").first()).toBeVisible();
    await expect(page.getByText("87").first()).toBeVisible();
  });

  test("C3: stat card values match API response", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/");

    await expect(page.getByText("142")).toBeVisible();
    await expect(page.getByText("28")).toBeVisible();
    await expect(page.getByText(/532[.,]00/)).toBeVisible();
    await expect(page.getByText("87")).toBeVisible();
  });

  test("C4: timeline shows all activity types", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/");

    await expect(page.getByText("Actividad Reciente")).toBeVisible();
    // Signups, contributions, rebalances all appear in unified timeline
    await expect(page.getByText("alice@example.com").first()).toBeVisible();
    await expect(page.getByText("bob@example.com").first()).toBeVisible();
    await expect(page.getByText("charlie@example.com").first()).toBeVisible();
    // Contribution amounts
    await expect(page.getByText("$500.00")).toBeVisible();
    await expect(page.getByText("$1,200.00")).toBeVisible();
    // Rebalance trigger type
    await expect(page.getByText("manual")).toBeVisible();
    await expect(page.getByText("auto")).toBeVisible();
  });

  test("C5: timeline entries show relative dates, not raw ISO", async ({
    page,
  }) => {
    await mockAdminAPIs(page);
    await page.goto("/");

    // Wait for timeline to render
    await expect(page.getByText("alice@example.com").first()).toBeVisible();

    // Raw ISO strings should NOT appear
    const content = await page.textContent("body");
    expect(content).not.toContain("2026-03-09T10:00:00Z");
    expect(content).not.toContain("2026-03-09T12:00:00Z");
  });

  test("C6: error state when stats API fails", async ({ page }) => {
    await mockAdminAPIs(page, { statsError: 500 });
    await page.goto("/");

    // Should show an error indicator (red error box)
    const errorBox = page.locator('[class*="red"], [class*="error"], [class*="danger"], [role="alert"]');
    await expect(errorBox.first()).toBeVisible({ timeout: 5000 });
  });

  test("C7: error shown when activity API fails (Promise.all rejects)", async ({
    page,
  }) => {
    await mockAdminAPIs(page, { activityError: 500 });
    await page.goto("/");

    // Since Promise.all rejects when any promise rejects, the error state is shown
    await expect(page.getByText(/Error/)).toBeVisible({ timeout: 5000 });

    // Stats should NOT be visible since the whole load failed
    await expect(page.getByText("142")).not.toBeVisible();
  });

  test("C8: empty activity shows sin actividad reciente", async ({ page }) => {
    await mockAdminAPIs(page, {
      activity: { recentSignups: [], recentContributions: [], recentRebalances: [] },
    });
    await page.goto("/");

    await expect(page.getByText("Sin actividad reciente")).toBeVisible();
  });

  test("C9: page title contains Dashboard - Margn Admin", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/");

    await expect(page).toHaveTitle(/Dashboard.*Margn Admin/);
  });

  // C10-C12: API integration tests — covered in api-integration.spec.ts
});
