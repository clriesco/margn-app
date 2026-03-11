/**
 * E2E Browser Tests: Admin Dashboard
 *
 * Tests admin UI pages by intercepting all /admin/** API calls.
 * Requires admin app running on localhost:3004 with NEXT_PUBLIC_E2E_TESTING=true.
 * Sets __e2e_bypass cookie to bypass Clerk auth middleware and client-side checks.
 *
 * Prerequisites:
 * - Admin app running on localhost:3004 (with NEXT_PUBLIC_E2E_TESTING=true)
 */

import { test, expect, Page } from "@playwright/test";

// Override baseURL for admin app (frontend config defaults to 3002)
test.use({ baseURL: "http://localhost:3004" });

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_STATS = {
  totalUsers: 142,
  proSubscribers: 28,
  mrr: 532.0,
  totalPortfolios: 87,
};

const MOCK_ACTIVITY = {
  recentSignups: [
    { email: "alice@example.com", createdAt: "2026-03-09T10:00:00Z" },
    { email: "bob@example.com", createdAt: "2026-03-08T14:30:00Z" },
    { email: "charlie@example.com", createdAt: "2026-03-07T09:15:00Z" },
  ],
};

const MOCK_USERS = {
  users: [
    { id: "u1", email: "alice@example.com", fullName: "Alice Smith", subscription: { tier: "pro" }, bannedAt: null, createdAt: "2026-01-15T00:00:00Z" },
    { id: "u2", email: "bob@example.com", fullName: "Bob Jones", subscription: { tier: "starter" }, bannedAt: null, createdAt: "2026-02-20T00:00:00Z" },
    { id: "u3", email: "charlie@example.com", fullName: null, subscription: { tier: "institutional" }, bannedAt: "2026-03-01T00:00:00Z", createdAt: "2025-12-01T00:00:00Z" },
  ],
  total: 3,
};

const MOCK_USER_DETAIL = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice Smith",
  role: "user",
  createdAt: "2026-01-15T00:00:00Z",
  bannedAt: null,
  banReason: null,
  subscription: { tier: "pro", status: "active" },
  portfolios: [
    { id: "p1", name: "Main Portfolio", positions: [{ id: "pos1" }, { id: "pos2" }] },
  ],
};

const MOCK_SUBSCRIPTIONS = {
  subscriptions: [
    { id: "s1", userId: "u1", tier: "pro", status: "active", currentPeriodEnd: "2026-04-15T00:00:00Z", cancelAtPeriodEnd: false, user: { email: "alice@example.com" } },
    { id: "s2", userId: "u2", tier: "starter", status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false, user: { email: "bob@example.com" } },
    { id: "s3", userId: "u3", tier: "pro", status: "trialing", currentPeriodEnd: "2026-03-20T00:00:00Z", cancelAtPeriodEnd: false, user: { email: "charlie@example.com" } },
  ],
  total: 3,
};

const MOCK_VOUCHERS = {
  vouchers: [
    { id: "v1", code: "PROMO50", discountType: "percentage", discountValue: 50, maxRedemptions: 100, applicableTiers: ["pro", "institutional"], isActive: true, _count: { redemptions: 12 } },
    { id: "v2", code: "TRIAL30", discountType: "trial_days", discountValue: 30, maxRedemptions: null, applicableTiers: ["pro"], isActive: true, _count: { redemptions: 5 } },
    { id: "v3", code: "OLD10", discountType: "fixed", discountValue: 10, maxRedemptions: 50, applicableTiers: ["pro"], isActive: false, _count: { redemptions: 50 } },
  ],
  total: 3,
};

const MOCK_CRON_STATUS = {
  jobs: [
    { key: "price-ingestion", lastRun: "2026-03-10T06:00:00Z", status: "success" },
    { key: "metrics-refresh", lastRun: "2026-03-10T07:00:00Z", status: "success" },
    { key: "daily-check", lastRun: "2026-03-10T09:00:00Z", status: "success" },
  ],
};

const MOCK_JOB_LOGS = {
  logs: [
    { id: "l1", jobName: "price-ingestion", status: "success", startedAt: "2026-03-10T06:00:00Z", durationMs: 12500, result: "45 prices updated" },
    { id: "l2", jobName: "metrics-refresh", status: "success", startedAt: "2026-03-10T07:00:00Z", durationMs: 8300, result: "87 portfolios refreshed" },
    { id: "l3", jobName: "daily-check", status: "error", startedAt: "2026-03-10T09:00:00Z", durationMs: 1200, error: "Connection timeout" },
  ],
  total: 3,
};

const MOCK_AUDIT_LOGS = {
  logs: [
    { id: "a1", adminId: "admin1", admin: { email: "admin@margn.es" }, action: "ban_user", targetId: "u3", details: { reason: "Spam" }, createdAt: "2026-03-09T15:00:00Z" },
    { id: "a2", adminId: "admin1", admin: { email: "admin@margn.es" }, action: "override_tier", targetId: "u1", details: { tier: "pro" }, createdAt: "2026-03-08T10:00:00Z" },
    { id: "a3", adminId: "admin1", admin: { email: "admin@margn.es" }, action: "create_voucher", targetId: "v1", details: { code: "PROMO50" }, createdAt: "2026-03-07T12:00:00Z" },
  ],
  total: 3,
};

// ─── Route Interceptor ──────────────────────────────────────────────────────

async function mockAdminAPIs(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();

    // Dashboard stats
    if (url.includes("/admin/dashboard/stats")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.stats || MOCK_STATS),
      });
    }

    // Dashboard activity
    if (url.includes("/admin/dashboard/activity")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.activity || MOCK_ACTIVITY),
      });
    }

    // User detail (must be before users list check)
    if (url.match(/\/admin\/users\/[^/?]+$/) && !url.includes("/role") && !url.includes("/ban") && !url.includes("/unban")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.userDetail || MOCK_USER_DETAIL),
      });
    }

    // Users list
    if (url.match(/\/admin\/users(\?|$)/)) {
      // Check if search param is present
      const urlObj = new URL(url);
      const search = urlObj.searchParams.get("search");
      if (search && overrides.usersSearch) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(overrides.usersSearch),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.users || MOCK_USERS),
      });
    }

    // Subscriptions
    if (url.match(/\/admin\/subscriptions(\?|$)/)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.subscriptions || MOCK_SUBSCRIPTIONS),
      });
    }

    // Vouchers
    if (url.match(/\/admin\/vouchers(\?|$)/) && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.vouchers || MOCK_VOUCHERS),
      });
    }

    // Cron status
    if (url.includes("/admin/operations/cron-status")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.cronStatus || MOCK_CRON_STATUS),
      });
    }

    // Job logs
    if (url.includes("/admin/operations/job-logs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.jobLogs || MOCK_JOB_LOGS),
      });
    }

    // Audit logs
    if (url.match(/\/admin\/audit-logs/)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overrides.auditLogs || MOCK_AUDIT_LOGS),
      });
    }

    // Default: empty success response
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

// Set bypass cookie before every test so the admin app skips Clerk auth
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "__e2e_bypass", value: "1", domain: "localhost", path: "/" },
  ]);
});

// ─── Dashboard ──────────────────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test("1. Shows 4 stat cards with correct values", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/");

    // Wait for stats to load
    await page.waitForSelector("text=142", { timeout: 15000 });

    // Verify all 4 stat card labels
    await expect(page.locator("text=Usuarios").first()).toBeVisible();
    await expect(page.locator("text=Suscriptores Pro").first()).toBeVisible();
    await expect(page.locator("text=MRR").first()).toBeVisible();
    await expect(page.locator("text=Portfolios").first()).toBeVisible();

    // Verify stat values
    await expect(page.locator("text=142").first()).toBeVisible();
    await expect(page.locator("text=28").first()).toBeVisible();
    const body = await page.textContent("body");
    expect(body).toContain("532.00");
    await expect(page.locator("text=87").first()).toBeVisible();
  });

  test("2. Shows recent signups", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/");

    await page.waitForSelector("text=Actividad Reciente", { timeout: 15000 });

    await expect(page.locator("text=alice@example.com").first()).toBeVisible();
    await expect(page.locator("text=bob@example.com").first()).toBeVisible();
    await expect(page.locator("text=charlie@example.com").first()).toBeVisible();
  });
});

// ─── Users ──────────────────────────────────────────────────────────────────

test.describe("Users page", () => {
  test("3. Shows user table with data", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/users");

    // Wait for table to render
    await page.waitForSelector("text=alice@example.com", { timeout: 15000 });

    // Table headers
    await expect(page.locator("th:has-text('Email')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Nombre')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Tier')").first()).toBeVisible();

    // User rows
    await expect(page.locator("text=alice@example.com").first()).toBeVisible();
    await expect(page.locator("text=Alice Smith").first()).toBeVisible();
    await expect(page.locator("text=bob@example.com").first()).toBeVisible();
    await expect(page.locator("text=Baneado").first()).toBeVisible();
  });

  test("4. Search input works", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/users");

    await page.waitForSelector("text=alice@example.com", { timeout: 15000 });

    // Search input exists and accepts input
    const searchInput = page.locator("input[placeholder*='Buscar']");
    await expect(searchInput).toBeVisible();

    // Type search term and verify input value
    await searchInput.fill("alice");
    await expect(searchInput).toHaveValue("alice");

    // The search triggers API calls; verify table re-renders (shows loading or results)
    // Since our mock returns data for all /admin/users requests, data should appear
    await expect(page.locator("table").first()).toBeVisible();
  });
});

// ─── Subscriptions ──────────────────────────────────────────────────────────

test.describe("Subscriptions page", () => {
  test("5. Shows subscription table", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/subscriptions");

    await page.waitForSelector("text=alice@example.com", { timeout: 15000 });

    // Table headers
    await expect(page.locator("th:has-text('Usuario')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Tier')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Estado')").first()).toBeVisible();

    // Data rows
    await expect(page.locator("td:has-text('pro')").first()).toBeVisible();
    await expect(page.locator("td:has-text('active')").first()).toBeVisible();
  });

  test("6. Has tier and status filter dropdowns", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/subscriptions");

    await page.waitForSelector("text=alice@example.com", { timeout: 15000 });

    // Tier filter dropdown exists and has options
    const selects = page.locator("select");
    await expect(selects).toHaveCount(2);

    const tierSelect = selects.first();
    await expect(tierSelect).toBeVisible();

    // Select "pro" option
    await tierSelect.selectOption("pro");
    await expect(tierSelect).toHaveValue("pro");

    // Status filter also works
    const statusSelect = selects.nth(1);
    await statusSelect.selectOption("active");
    await expect(statusSelect).toHaveValue("active");
  });
});

// ─── Vouchers ───────────────────────────────────────────────────────────────

test.describe("Vouchers page", () => {
  test("7. Shows voucher list", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await page.waitForSelector("text=PROMO50", { timeout: 15000 });

    // Table headers
    await expect(page.locator("th:has-text('Código')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Tipo')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Valor')").first()).toBeVisible();

    // Voucher data
    await expect(page.locator("text=PROMO50").first()).toBeVisible();
    await expect(page.locator("text=TRIAL30").first()).toBeVisible();
    await expect(page.locator("text=OLD10").first()).toBeVisible();
  });

  test("8. Has create voucher form", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await page.waitForSelector("text=PROMO50", { timeout: 15000 });

    // Click create button
    const createBtn = page.locator("button:has-text('Crear Voucher')");
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Form should appear
    await expect(page.locator("text=Nuevo Voucher").first()).toBeVisible();
    await expect(page.locator("label:has-text('Código')").first()).toBeVisible();
    await expect(page.locator("label:has-text('Tipo')").first()).toBeVisible();
    await expect(page.locator("label:has-text('Valor')").first()).toBeVisible();
    await expect(page.locator("label:has-text('Máximo usos')").first()).toBeVisible();

    // Code input is present
    const codeInput = page.locator("input[placeholder='PROMO50']");
    await expect(codeInput).toBeVisible();
  });
});

// ─── Operations ─────────────────────────────────────────────────────────────

test.describe("Operations page", () => {
  test("9. Shows 3 job cards", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    await page.waitForSelector("text=Price Ingestion", { timeout: 15000 });

    await expect(page.locator("text=Price Ingestion").first()).toBeVisible();
    await expect(page.locator("text=Metrics Refresh").first()).toBeVisible();
    await expect(page.locator("text=Daily Check").first()).toBeVisible();

    // Each card has a trigger button
    const executeButtons = page.locator("button:has-text('Ejecutar')");
    await expect(executeButtons).toHaveCount(3);
  });

  test("10. Shows job logs table", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/operations");

    await page.waitForSelector("text=Historial de Ejecuciones", { timeout: 15000 });

    // Table headers
    await expect(page.locator("th:has-text('Job')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Estado')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Duración')").first()).toBeVisible();

    // Log entries
    await expect(page.locator("td:has-text('price-ingestion')").first()).toBeVisible();
    await expect(page.locator("text=45 prices updated").first()).toBeVisible();
    await expect(page.locator("td:has-text('success')").first()).toBeVisible();
    await expect(page.locator("td:has-text('error')").first()).toBeVisible();
  });
});

// ─── Audit Logs ─────────────────────────────────────────────────────────────

test.describe("Audit Logs page", () => {
  test("11. Shows audit log table", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/audit-logs");

    await page.waitForSelector("text=admin@margn.es", { timeout: 15000 });

    // Table headers
    await expect(page.locator("th:has-text('Fecha')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Admin')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Acción')").first()).toBeVisible();
    await expect(page.locator("th:has-text('Target')").first()).toBeVisible();

    // Log entries
    await expect(page.locator("text=admin@margn.es").first()).toBeVisible();
    await expect(page.locator("text=ban_user").first()).toBeVisible();
    await expect(page.locator("text=override_tier").first()).toBeVisible();
    await expect(page.locator("text=create_voucher").first()).toBeVisible();
  });
});

// ─── Sidebar Navigation ────────────────────────────────────────────────────

test.describe("Sidebar navigation", () => {
  test("12. Navigates between all pages", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/");

    await page.waitForSelector("text=Margn Admin", { timeout: 15000 });

    // Verify sidebar items are visible
    await expect(page.locator("a:has-text('Dashboard')").first()).toBeVisible();
    await expect(page.locator("a:has-text('Usuarios')").first()).toBeVisible();
    await expect(page.locator("a:has-text('Suscripciones')").first()).toBeVisible();
    await expect(page.locator("a:has-text('Vouchers')").first()).toBeVisible();
    await expect(page.locator("a:has-text('Operaciones')").first()).toBeVisible();
    await expect(page.locator("a:has-text('Audit Log')").first()).toBeVisible();

    // Navigate to Users
    await page.locator("a:has-text('Usuarios')").first().click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });

    // Navigate to Subscriptions
    await page.locator("a:has-text('Suscripciones')").first().click();
    await expect(page).toHaveURL(/\/subscriptions/, { timeout: 5000 });

    // Navigate to Vouchers
    await page.locator("a:has-text('Vouchers')").first().click();
    await expect(page).toHaveURL(/\/vouchers/, { timeout: 5000 });

    // Navigate to Operations
    await page.locator("a:has-text('Operaciones')").first().click();
    await expect(page).toHaveURL(/\/operations/, { timeout: 5000 });

    // Navigate to Audit Log
    await page.locator("a:has-text('Audit Log')").first().click();
    await expect(page).toHaveURL(/\/audit-logs/, { timeout: 5000 });

    // Navigate back to Dashboard
    await page.locator("a:has-text('Dashboard')").first().click();
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  });
});

// ─── User Detail ────────────────────────────────────────────────────────────

test.describe("User detail page", () => {
  test("13. Shows user info and admin actions", async ({ page }) => {
    await mockAdminAPIs(page);

    // Navigate directly to user detail page
    await page.goto("/users/u1");

    await page.waitForSelector("text=Información", { timeout: 15000 });

    // User info section
    await expect(page.locator("text=Alice Smith").first()).toBeVisible();
    await expect(page.locator("text=alice@example.com").first()).toBeVisible();

    // Subscription section
    await expect(page.locator("text=Suscripción").first()).toBeVisible();

    // Admin action buttons
    await expect(page.locator("button:has-text('Hacer Admin')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Override Tier')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Extender Trial')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Complimentary')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Banear')").first()).toBeVisible();

    // Back button
    await expect(page.locator("text=Volver a usuarios").first()).toBeVisible();

    // Portfolio section
    await expect(page.locator("text=Main Portfolio").first()).toBeVisible();
  });
});
