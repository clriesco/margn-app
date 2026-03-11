import { test, expect } from "@playwright/test";
import {
  mockAdminAPIs,
  setBypassCookie,
  MOCK_SUBSCRIPTIONS,
  MOCK_SUBSCRIPTIONS_EMPTY,
} from "./helpers";

test.beforeEach(async ({ context }) => {
  await setBypassCookie(context);
});

// F1: Table renders with correct headers
test("renders table with correct headers", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  for (const header of ["Usuario", "Tier", "Estado", "Período", "Cancel"]) {
    await expect(
      page.getByRole("columnheader", { name: header })
    ).toBeVisible();
  }
});

// F2: Shows subscription rows with correct data
test("shows subscription rows with correct data", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  // Verify data from MOCK_SUBSCRIPTIONS
  await expect(page.getByText("alice@example.com")).toBeVisible();
  await expect(page.getByText("bob@example.com")).toBeVisible();
  await expect(page.getByText("charlie@example.com")).toBeVisible();

  // Verify tiers are shown in the table
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(3);
});

// F3: Status badge colors — active in green, trialing in blue
test("status badges have correct styling", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  // active badge should have green color
  const activeBadge = page.locator("span", { hasText: "active" }).first();
  await expect(activeBadge).toBeVisible();
  await expect(activeBadge).toHaveCSS("color", "rgb(52, 211, 153)"); // #34d399

  // trialing badge should have blue color
  const trialingBadge = page.locator("span", { hasText: "trialing" });
  await expect(trialingBadge).toBeVisible();
  await expect(trialingBadge).toHaveCSS("color", "rgb(96, 165, 250)"); // #60a5fa
});

// F4: Cancel column shows correct values
test("cancel column shows Si for cancelAtPeriodEnd and No otherwise", async ({
  page,
}) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  const rows = page.locator("tbody tr");

  // s1 has cancelAtPeriodEnd: false → "No"
  // s3 has cancelAtPeriodEnd: true → "Sí"
  await expect(rows.nth(0).locator("td").nth(4)).toHaveText("No");
  await expect(rows.nth(2).locator("td").nth(4)).toHaveText("Sí");
});

// F5: User email links to /users/{userId}
test("user email links to correct user detail page", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  const aliceLink = page.getByRole("link", { name: "alice@example.com" });
  await expect(aliceLink).toBeVisible();
  await expect(aliceLink).toHaveAttribute("href", "/users/u1");
});

// F6: Tier dropdown filters subscriptions
test("tier dropdown filter sends correct API request", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  // Wait for initial load
  await expect(page.getByText("alice@example.com")).toBeVisible();

  // Set up request interception to check the tier param
  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/subscriptions") &&
    req.url().includes("tier=pro")
  );

  // Select "pro" in the tier dropdown
  const tierSelect = page.locator("select").first();
  await tierSelect.selectOption("pro");

  const request = await requestPromise;
  expect(request.url()).toContain("tier=pro");
});

// F7: Status dropdown filters subscriptions
test("status dropdown filter sends correct API request", async ({ page }) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  await expect(page.getByText("alice@example.com")).toBeVisible();

  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/subscriptions") &&
    req.url().includes("status=active")
  );

  // Status is the second select
  const statusSelect = page.locator("select").nth(1);
  await statusSelect.selectOption("active");

  const request = await requestPromise;
  expect(request.url()).toContain("status=active");
});

// F8: Changing filter resets page to 1
test("changing filter resets page to 1", async ({ page }) => {
  // Provide paginated data so the page state is > 1
  const paginatedSubs = {
    ...MOCK_SUBSCRIPTIONS,
    meta: { total: 41, page: 1, limit: 20 },
  };
  await mockAdminAPIs(page, { subscriptions: paginatedSubs });
  await page.goto("/subscriptions");

  await expect(page.getByText("alice@example.com")).toBeVisible();

  // Navigate to page 2 first — set up request promise before clicking
  const page2Promise = page.waitForRequest((req) =>
    req.url().includes("/admin/subscriptions") &&
    req.url().includes("page=2")
  );
  const pageIndicator = page.getByText(/Página \d+ de \d+/);
  await expect(pageIndicator).toBeVisible();
  const nextButton = pageIndicator.locator('..').locator("button").last();
  await nextButton.click();
  await page2Promise;

  // Now change filter — should reset to page 1
  const requestPromise = page.waitForRequest((req) => {
    const url = req.url();
    return (
      url.includes("/admin/subscriptions") &&
      url.includes("tier=pro") &&
      (url.includes("page=1") || !url.includes("page="))
    );
  });

  const tierSelect = page.locator("select").first();
  await tierSelect.selectOption("pro");

  await requestPromise;
});

// F9: Pagination works with filtered results
test("pagination works with filtered results", async ({ page }) => {
  const paginatedSubs = {
    data: MOCK_SUBSCRIPTIONS.data,
    meta: { total: 41, page: 1, limit: 20 },
  };
  await mockAdminAPIs(page, { subscriptions: paginatedSubs });
  await page.goto("/subscriptions");

  await expect(page.getByText("alice@example.com")).toBeVisible();

  // Pagination should be visible (total 41, limit 20 = 3 pages)
  await expect(page.getByText(/Página 1 de 3/)).toBeVisible();

  // Click next — set up request promise before clicking
  const requestPromise = page.waitForRequest((req) =>
    req.url().includes("/admin/subscriptions") &&
    req.url().includes("page=2")
  );

  const pageIndicator = page.getByText(/Página \d+ de \d+/);
  const nextButton = pageIndicator.locator('..').locator("button").last();
  await nextButton.click();

  await requestPromise;
});

// F10: Empty results show "Sin resultados"
test("shows Sin resultados when no subscriptions match", async ({ page }) => {
  await mockAdminAPIs(page, { subscriptions: MOCK_SUBSCRIPTIONS_EMPTY });
  await page.goto("/subscriptions");

  await expect(page.getByText("Sin resultados")).toBeVisible();
});

// F11: Has 2 select dropdowns for tier and status
test("has two select dropdowns for tier and status filters", async ({
  page,
}) => {
  await mockAdminAPIs(page);
  await page.goto("/subscriptions");

  const selects = page.locator("select");
  await expect(selects).toHaveCount(2);

  // First select has tier options
  await expect(selects.first().locator("option")).toContainText([
    "Todos los tiers",
    "starter",
    "pro",
    "institutional",
  ]);

  // Second select has status options
  await expect(selects.nth(1).locator("option")).toContainText([
    "Todos los estados",
    "active",
    "trialing",
  ]);
});
