import { test, expect } from "@playwright/test";
import {
  mockAdminAPIs,
  setBypassCookie,
  MOCK_JOB_LOGS,
  MOCK_JOB_LOGS_EMPTY,
  MOCK_CRON_STATUS,
} from "./helpers";

test.describe("Operations", () => {
  test.beforeEach(async ({ context }) => {
    await setBypassCookie(context);
  });

  test("H1: renders 3 job cards with names", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    await expect(page.getByText("Price Ingestion")).toBeVisible();
    await expect(page.getByText("Metrics Refresh")).toBeVisible();
    await expect(page.getByText("Daily Check")).toBeVisible();
  });

  test("H2: each card shows description text", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    await expect(page.getByText("Ingestión de precios de Yahoo Finance")).toBeVisible();
    await expect(page.getByText("Recálculo de métricas de portfolios")).toBeVisible();
    await expect(page.getByText("Generación de notificaciones de estado")).toBeVisible();
  });

  test("H3: each card has Ejecutar button", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    const ejecutarButtons = page.getByRole("button", { name: /Ejecutar/i });
    await expect(ejecutarButtons).toHaveCount(3);
  });

  test("H4: clicking Ejecutar disables all buttons", async ({ page }) => {
    // Set up base mocks first
    await mockAdminAPIs(page);

    // Override trigger-job AFTER mockAdminAPIs so it takes priority (LIFO order)
    await page.route("**/api/admin/operations/trigger-job**", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 2000));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ logId: "log-new", status: "started", jobName: "price-ingestion" }),
        });
      }
      return route.fallback();
    });

    await page.goto("/operations");

    // Wait for buttons to be ready
    const ejecutarButtons = page.getByRole("button", { name: /Ejecutar/i });
    await expect(ejecutarButtons).toHaveCount(3);

    // Click the first Ejecutar button (don't await navigation)
    await ejecutarButtons.first().click();

    // All 3 buttons should be disabled while triggering
    const allJobButtons = page.locator("button", { hasText: /Ejecutar|Ejecutando/ });
    for (let i = 0; i < 3; i++) {
      await expect(allJobButtons.nth(i)).toBeDisabled();
    }
  });

  test("H5: button shows Ejecutando... while running", async ({ page }) => {
    // Set up base mocks first
    await mockAdminAPIs(page);

    // Override trigger-job AFTER mockAdminAPIs so it takes priority
    await page.route("**/api/admin/operations/trigger-job**", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 2000));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ logId: "log-new", status: "started", jobName: "price-ingestion" }),
        });
      }
      return route.fallback();
    });

    await page.goto("/operations");

    const ejecutarButtons = page.getByRole("button", { name: "Ejecutar" });
    await expect(ejecutarButtons.first()).toBeVisible();
    await ejecutarButtons.first().click();

    await expect(page.getByText("Ejecutando...")).toBeVisible();
  });

  test("H6: success toast after trigger", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    const ejecutarButtons = page.getByRole("button", { name: "Ejecutar" });
    await expect(ejecutarButtons.first()).toBeVisible();

    // Click the first card's button (Price Ingestion)
    await ejecutarButtons.first().click();

    await expect(page.locator("[role='alert']", { hasText: /Job "price-ingestion" ejecutado/ })).toBeVisible();
  });

  test("H7: error toast when trigger fails", async ({ page }) => {
    // Set up base mocks first
    await mockAdminAPIs(page);

    // Override trigger-job AFTER mockAdminAPIs to return 500
    await page.route("**/api/admin/operations/trigger-job**", async (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Internal server error" }),
        });
      }
      return route.fallback();
    });

    await page.goto("/operations");

    const ejecutarButtons = page.getByRole("button", { name: "Ejecutar" });
    await expect(ejecutarButtons.first()).toBeVisible();
    await ejecutarButtons.first().click();

    // Should show error toast
    await expect(page.locator("[role='alert']", { hasText: /Internal server error|Error/ })).toBeVisible({ timeout: 5000 });
  });

  test("H8: Refrescar button is visible and reloads data", async ({ page }) => {
    let cronStatusCalls = 0;

    // Set up base mocks first
    await mockAdminAPIs(page);

    // Override cron-status AFTER mockAdminAPIs to track calls
    await page.route("**/api/admin/operations/cron-status**", async (route) => {
      cronStatusCalls++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CRON_STATUS),
      });
    });

    await page.goto("/operations");

    const refreshBtn = page.getByRole("button", { name: /Refrescar/i });
    await expect(refreshBtn).toBeVisible();

    // Record initial call count, then click refresh
    const initialCalls = cronStatusCalls;
    await refreshBtn.click();
    await page.waitForTimeout(500);

    expect(cronStatusCalls).toBeGreaterThan(initialCalls);
  });

  test("H9: job logs table headers visible", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    for (const header of ["Job", "Estado", "Inicio", "Duración", "Resultado"]) {
      await expect(page.locator("th", { hasText: header })).toBeVisible();
    }
  });

  test("H10: log rows show correct data", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    // Wait for table to render
    await expect(page.locator("th", { hasText: "Job" })).toBeVisible();

    // First log: price-ingestion, 12.5s duration
    const priceRow = page.locator("tbody tr", { hasText: "price-ingestion" });
    await expect(priceRow).toBeVisible();
    await expect(priceRow.locator("td").nth(3)).toHaveText("12.5s");

    // Second log: metrics-refresh, 8.3s
    const metricsRow = page.locator("tbody tr", { hasText: "metrics-refresh" });
    await expect(metricsRow).toBeVisible();
    await expect(metricsRow.locator("td").nth(3)).toHaveText("8.3s");

    // Third log: daily-check, failed with error
    const dailyRow = page.locator("tbody tr", { hasText: "daily-check" });
    await expect(dailyRow).toBeVisible();
    await expect(dailyRow.getByText("Connection timeout")).toBeVisible();
  });

  test("H11: status badges colored correctly", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    // Success badge should be green (#34d399)
    const successBadge = page.locator("tbody tr", { hasText: "price-ingestion" }).locator("span", { hasText: "success" });
    await expect(successBadge).toBeVisible();
    const successColor = await successBadge.evaluate((el) => getComputedStyle(el).color);
    expect(successColor).toContain("52, 211, 153");

    // Failed badge should be red (#f87171)
    const failedBadge = page.locator("tbody tr", { hasText: "daily-check" }).locator("span", { hasText: "failed" });
    await expect(failedBadge).toBeVisible();
    const failedColor = await failedBadge.evaluate((el) => getComputedStyle(el).color);
    expect(failedColor).toContain("248, 113, 113");
  });

  test("H12: empty logs show Sin registros", async ({ page }) => {
    await mockAdminAPIs(page, { jobLogs: MOCK_JOB_LOGS_EMPTY });
    await page.goto("/operations");

    await expect(page.getByText("Sin registros")).toBeVisible();
  });
});
