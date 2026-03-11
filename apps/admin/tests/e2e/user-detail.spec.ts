import { test, expect } from "@playwright/test";
import {
  mockAdminAPIs,
  setBypassCookie,
  MOCK_USER_DETAIL,
  MOCK_USER_DETAIL_ADMIN,
  MOCK_USER_DETAIL_BANNED,
} from "./helpers";

test.beforeEach(async ({ context }) => {
  await setBypassCookie(context);
});

// E1: Loading state
test("E1: shows loading indicator before data is fetched", async ({ page }) => {
  await page.route("**/api/admin/users/u1", async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER_DETAIL) });
  });
  await mockAdminAPIs(page);

  await page.goto("/users/u1");
  await expect(page.getByText("Cargando...")).toBeVisible();
});

// E2: User info fields
test("E2: displays user info: name, email, role badge, date", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");

  await expect(page.getByText("Alice Smith")).toBeVisible();
  await expect(page.getByRole("heading", { name: "alice@example.com" })).toBeVisible();
  // Date formatted as es-ES locale
  await expect(page.getByText(/15.*ene.*2026/)).toBeVisible();
});

// E3: Subscription details
test("E3: shows subscription tier, status, and billing info", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");

  // Tier badge
  const proBadges = page.locator("span", { hasText: "pro" });
  await expect(proBadges.first()).toBeVisible();
  // Status badge
  await expect(page.locator("span", { hasText: "active" }).first()).toBeVisible();
  // Billing interval
  await expect(page.getByText("Mensual")).toBeVisible();
  // Period end date
  await expect(page.getByText(/15\/4\/2026|15.*abr.*2026/)).toBeVisible();
});

// E4: Portfolios table with metrics
test("E4: shows portfolios table with equity and leverage", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");

  await expect(page.getByText("Portfolios (1)")).toBeVisible();
  await expect(page.getByText("Main Portfolio")).toBeVisible();
  // Equity
  await expect(page.getByText(/15[,.]420/)).toBeVisible();
  // Leverage
  await expect(page.getByText("3.12x")).toBeVisible();
});

// E5: Back link
test("E5: back link navigates to /users", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");

  await page.getByText("Volver a usuarios").click();
  await expect(page).toHaveURL(/\/users$/);
});

// E6: Recent contributions
test("E6: shows recent contributions timeline", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");

  await expect(page.getByText("Contribuciones recientes")).toBeVisible();
  await expect(page.getByText("$500.00").first()).toBeVisible();
});

// E7: Stats counters
test("E7: shows portfolio and strategy counts", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");

  await expect(page.getByText("Estrategias guardadas")).toBeVisible();
  await expect(page.getByText("3")).toBeVisible();
});

// E8: Override Tier inline form
test("E8: Override Tier inline form sends request", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  // Open danger zone is not needed — tier actions are in subscription card
  await page.getByRole("button", { name: /Override Tier/ }).click();

  // Select tier in inline form
  const tierSelect = page.locator("select").last();
  await tierSelect.selectOption("institutional");

  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/subscriptions/u1") && req.method() === "PUT"
  );

  await page.getByRole("button", { name: /Aplicar/ }).first().click();
  const request = await requestPromise;
  const body = JSON.parse(request.postData() || "{}");
  expect(body.tier).toBe("institutional");
});

// E9: Extend Trial inline form
test("E9: Extend Trial inline form sends request with days", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  await page.getByRole("button", { name: /Extender Trial/ }).click();

  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/subscriptions/u1/extend-trial") && req.method() === "POST"
  );

  // Default value is 14 — just click apply
  await page.getByRole("button", { name: /Aplicar/ }).first().click();
  const request = await requestPromise;
  const body = JSON.parse(request.postData() || "{}");
  expect(body.days).toBe(14);
});

// E10: Complimentary inline form
test("E10: Complimentary inline form sends request with tier", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  await page.getByRole("button", { name: /Complimentary/ }).click();

  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/subscriptions/u1/comp") && req.method() === "POST"
  );

  await page.getByRole("button", { name: /Otorgar/ }).click();
  const request = await requestPromise;
  const body = JSON.parse(request.postData() || "{}");
  expect(body.tier).toBe("pro");
});

// E11: Danger zone is collapsed by default
test("E11: danger zone is collapsed by default", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  // Danger zone header visible
  await expect(page.getByText("Zona peligrosa")).toBeVisible();
  // But actions are hidden
  await expect(page.getByRole("button", { name: /Hacer Admin/ })).not.toBeVisible();
});

// E12: Danger zone expands on click
test("E12: clicking danger zone reveals admin and ban actions", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  await page.getByText("Zona peligrosa").click();
  await expect(page.getByRole("button", { name: /Hacer Admin/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Banear/ })).toBeVisible();
});

// E13: Hacer Admin sends request
test("E13: Hacer Admin button sends role update", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  await page.getByText("Zona peligrosa").click();

  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/users/u1/role") && req.method() === "PUT"
  );

  await page.getByRole("button", { name: /Hacer Admin/ }).click();
  const request = await requestPromise;
  const body = JSON.parse(request.postData() || "{}");
  expect(body.role).toBe("admin");
});

// E14: Quitar Admin for admin users
test("E14: shows Quitar Admin button for admin users", async ({ page }) => {
  await mockAdminAPIs(page, { userDetail: MOCK_USER_DETAIL_ADMIN });
  await page.goto("/users/u1");

  await page.getByText("Zona peligrosa").click();
  await expect(page.getByRole("button", { name: /Quitar Admin/ })).toBeVisible();
});

// E15: Ban flow with reason input
test("E15: ban flow requires reason before confirming", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  await page.getByText("Zona peligrosa").click();
  await page.getByRole("button", { name: /Banear/ }).click();

  // Confirm button disabled without reason
  const confirmBtn = page.getByRole("button", { name: /Confirmar ban/ });
  await expect(confirmBtn).toBeDisabled();

  // Fill reason
  await page.locator("input[placeholder*='Razon']").fill("Spam");
  await expect(confirmBtn).toBeEnabled();

  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/users/u1/ban") && req.method() === "POST"
  );

  await confirmBtn.click();
  const request = await requestPromise;
  const body = JSON.parse(request.postData() || "{}");
  expect(body.reason).toBe("Spam");
});

// E16: Banned user shows ban info and unban button
test("E16: banned user shows ban reason and desbanear button", async ({ page }) => {
  await mockAdminAPIs(page, { userDetail: MOCK_USER_DETAIL_BANNED });
  await page.goto("/users/u3");

  // Ban badge in header
  await expect(page.locator("span", { hasText: "baneado" })).toBeVisible();
  // Ban reason in info section
  await expect(page.getByText("Spam account")).toBeVisible();

  // Danger zone: desbanear visible, banear not
  await page.getByText("Zona peligrosa").click();
  await expect(page.getByRole("button", { name: /Desbanear/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Banear/ })).not.toBeVisible();
});

// E17: No portfolios section when empty
test("E17: hides portfolios section when user has none", async ({ page }) => {
  await mockAdminAPIs(page, { userDetail: MOCK_USER_DETAIL_BANNED });
  await page.goto("/users/u3");

  await expect(page.getByRole("heading", { name: "charlie@example.com" })).toBeVisible();
  await expect(page.locator("h2", { hasText: /Portfolios/ })).toHaveCount(0);
});

// E18: Success toast after action
test("E18: success toast appears after completing an action", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/users/u1");
  await expect(page.getByText("Alice Smith")).toBeVisible();

  await page.getByText("Zona peligrosa").click();
  await page.getByRole("button", { name: /Hacer Admin/ }).click();

  // Toast appears with role="alert"
  await expect(page.locator("[role='alert']", { hasText: /completada/ })).toBeVisible();
});
