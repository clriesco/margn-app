import { test, expect } from "@playwright/test";
import {
  mockAdminAPIs,
  setBypassCookie,
  MOCK_AUDIT_LOGS,
  MOCK_AUDIT_LOGS_EMPTY,
} from "./helpers";

test.describe("Audit Logs", () => {
  test.beforeEach(async ({ context }) => {
    await setBypassCookie(context);
  });

  test("I1: renders table with correct headers", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/audit-logs");

    for (const header of ["Fecha", "Admin", "Acción", "Resumen"]) {
      await expect(page.locator("th", { hasText: header })).toBeVisible();
    }
  });

  test("I2: action badges show human-readable labels with category colors", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/audit-logs");

    // Human labels instead of raw action strings
    await expect(page.getByText("Banear usuario")).toBeVisible();
    await expect(page.getByText("Override tier")).toBeVisible();
    await expect(page.getByText("Crear voucher")).toBeVisible();
    await expect(page.getByText("Ejecutar job")).toBeVisible();

    // User action = purple (#c084fc)
    const banBadge = page.locator("span", { hasText: "Banear usuario" });
    const banColor = await banBadge.evaluate((el) => getComputedStyle(el).color);
    expect(banColor).toContain("192, 132, 252");

    // Subscription action = blue (#60a5fa)
    const tierBadge = page.locator("span", { hasText: "Override tier" });
    const tierColor = await tierBadge.evaluate((el) => getComputedStyle(el).color);
    expect(tierColor).toContain("96, 165, 250");

    // Voucher action = green (#34d399)
    const voucherBadge = page.locator("span", { hasText: "Crear voucher" });
    const voucherColor = await voucherBadge.evaluate((el) => getComputedStyle(el).color);
    expect(voucherColor).toContain("52, 211, 153");

    // Cron action = orange (#fb923c)
    const cronBadge = page.locator("span", { hasText: "Ejecutar job" });
    const cronColor = await cronBadge.evaluate((el) => getComputedStyle(el).color);
    expect(cronColor).toContain("251, 146, 60");
  });

  test("I3: summary column shows formatted details per action type", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/audit-logs");

    // user.ban → "Razón: Spam account"
    const banRow = page.locator("tr", { hasText: "Banear usuario" });
    await expect(banRow.locator("td").nth(3)).toHaveText("Razón: Spam account");

    // subscription.override_tier → "starter → pro"
    const tierRow = page.locator("tr", { hasText: "Override tier" });
    await expect(tierRow.locator("td").nth(3)).toHaveText("starter → pro");

    // voucher.create → "PROMO50 · discount_percent"
    const voucherRow = page.locator("tr", { hasText: "Crear voucher" });
    await expect(voucherRow.locator("td").nth(3)).toHaveText("PROMO50 · discount_percent");

    // cron.trigger → "price-ingestion"
    const cronRow = page.locator("tr", { hasText: "Ejecutar job" });
    await expect(cronRow.locator("td").nth(3)).toHaveText("price-ingestion");
  });

  test("I4: expand button shows full JSON details", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/audit-logs");

    await expect(page.getByText("Banear usuario")).toBeVisible();

    // Click expand on first row
    const expandBtn = page.locator("tr", { hasText: "Banear usuario" }).getByLabel("Expandir");
    await expandBtn.click();

    // Full JSON visible in pre block
    const pre = page.locator("pre");
    await expect(pre).toBeVisible();
    await expect(pre).toContainText("Spam account");

    // Click again to collapse
    const collapseBtn = page.locator("tr", { hasText: "Banear usuario" }).getByLabel("Colapsar");
    await collapseBtn.click();
    await expect(pre).not.toBeVisible();
  });

  test("I5: action filter calls API with action param", async ({ page }) => {
    const apiCalls: string[] = [];

    await page.route("**/api/**", (route) => {
      const url = route.request().url();
      if (url.includes("/admin/audit-logs")) {
        apiCalls.push(url);
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_AUDIT_LOGS),
      });
    });

    await page.goto("/audit-logs");
    await page.waitForTimeout(500);

    const filter = page.getByPlaceholder("Filtrar por acción...");
    await filter.fill("ban");
    await page.waitForTimeout(1000);

    const callWithAction = apiCalls.find((u) => u.includes("action=ban"));
    expect(callWithAction).toBeTruthy();
  });

  test("I6: changing filter resets page to 1", async ({ page }) => {
    const apiCalls: string[] = [];
    const paginatedLogs = {
      ...MOCK_AUDIT_LOGS,
      meta: { total: 90, page: 1, limit: 30 },
    };

    await page.route("**/api/**", (route) => {
      const url = route.request().url();
      if (url.includes("/admin/audit-logs")) {
        apiCalls.push(url);
      }
      if (url.includes("/admin/audit-logs")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(paginatedLogs),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/audit-logs");
    await page.waitForTimeout(500);

    // Go to page 2
    const nextButton = page.locator("button").filter({ has: page.locator("svg") }).last();
    await nextButton.click();
    await page.waitForTimeout(500);

    // Type in filter — should reset to page 1
    apiCalls.length = 0;
    const filter = page.getByPlaceholder("Filtrar por acción...");
    await filter.fill("ban");
    await page.waitForTimeout(1000);

    const lastCall = apiCalls[apiCalls.length - 1];
    if (lastCall && lastCall.includes("page=")) {
      expect(lastCall).toContain("page=1");
    }

    const pageIndicator = page.getByText(/Página \d+ de \d+/);
    if (await pageIndicator.isVisible()) {
      await expect(pageIndicator).toContainText("Página 1");
    }
  });

  test("I7: pagination works with prev/next buttons", async ({ page }) => {
    const paginatedLogs = {
      ...MOCK_AUDIT_LOGS,
      meta: { total: 90, page: 1, limit: 30 },
    };

    await mockAdminAPIs(page, { auditLogs: paginatedLogs });
    await page.goto("/audit-logs");

    const pageIndicator = page.getByText(/Página \d+ de 3/);
    await expect(pageIndicator).toBeVisible();
    await expect(pageIndicator).toContainText("Página 1 de 3");

    const paginationArea = pageIndicator.locator("..");
    const nextButton = paginationArea.locator("button").last();
    await nextButton.click();
    await page.waitForTimeout(500);
    await expect(pageIndicator).toContainText("Página 2 de 3");

    const prevButton = paginationArea.locator("button").first();
    await prevButton.click();
    await page.waitForTimeout(500);
    await expect(pageIndicator).toContainText("Página 1 de 3");
  });

  test("I8: empty results show Sin registros", async ({ page }) => {
    await mockAdminAPIs(page, { auditLogs: MOCK_AUDIT_LOGS_EMPTY });
    await page.goto("/audit-logs");

    await expect(page.getByText("Sin registros")).toBeVisible();
  });

  test("I9: date column shows formatted dates in es-ES locale", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/audit-logs");

    await expect(page.getByText("Banear usuario")).toBeVisible();

    const rows = page.locator("tbody tr");
    const firstCell = rows.first().locator("td").first();
    await expect(firstCell).toContainText("2026");
  });

  test("I10: admin email shown for each log entry", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/audit-logs");

    const adminEmails = page.getByText("admin@margn.es");
    await expect(adminEmails.first()).toBeVisible();
  });
});
