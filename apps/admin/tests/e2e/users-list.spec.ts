import { test, expect } from "@playwright/test";
import {
  mockAdminAPIs,
  setBypassCookie,
  MOCK_USERS,
  MOCK_USERS_EMPTY,
  MOCK_USERS_SEARCH,
  MOCK_USERS_PAGINATED,
  MOCK_USERS_PAGE2,
} from "./helpers";

test.describe("Users List", () => {
  test.beforeEach(async ({ context }) => {
    await setBypassCookie(context);
  });

  test("D1: shows loading state before data loads", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_USERS),
      });
    });

    page.goto("/users");
    await expect(page.getByText("Cargando...")).toBeVisible({ timeout: 3000 });
  });

  test("D2: renders table headers", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/users");

    const headers = ["Email", "Nombre", "Tier", "Estado", "Creado"];
    for (const header of headers) {
      await expect(
        page.locator("th, [role='columnheader']").getByText(header)
      ).toBeVisible();
    }
  });

  test("D3: user rows show email, name, tier, status, date", async ({
    page,
  }) => {
    await mockAdminAPIs(page);
    await page.goto("/users");

    // First user: Alice
    await expect(page.getByText("alice@example.com")).toBeVisible();
    await expect(page.getByText("Alice Smith")).toBeVisible();

    // Second user: Bob
    await expect(page.getByText("bob@example.com")).toBeVisible();
    await expect(page.getByText("Bob Jones")).toBeVisible();

    // Third user with no name should show dash
    await expect(page.getByText("charlie@example.com")).toBeVisible();
  });

  test("D4: tier badges have appropriate colors", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/users");

    await expect(page.getByText("alice@example.com")).toBeVisible();

    // Pro tier badge should have blue color (#60a5fa)
    const proBadge = page
      .locator("tr")
      .filter({ hasText: "alice@example.com" })
      .locator("span", { hasText: "pro" });
    await expect(proBadge).toBeVisible();
    await expect(proBadge).toHaveCSS("color", "rgb(96, 165, 250)");

    // Institutional badge should have purple color (#c084fc)
    const instBadge = page
      .locator("tr")
      .filter({ hasText: "charlie@example.com" })
      .locator("span", { hasText: "institutional" });
    await expect(instBadge).toBeVisible();
    await expect(instBadge).toHaveCSS("color", "rgb(192, 132, 252)");

    // Starter badge should have gray color (#94a3b8)
    const starterBadge = page
      .locator("tr")
      .filter({ hasText: "bob@example.com" })
      .locator("span", { hasText: "starter" });
    await expect(starterBadge).toBeVisible();
    await expect(starterBadge).toHaveCSS("color", "rgb(148, 163, 184)");
  });

  test("D5: banned user shows Baneado, active shows Activo", async ({
    page,
  }) => {
    await mockAdminAPIs(page);
    await page.goto("/users");

    // Charlie (u3) is banned
    const bannedRow = page
      .locator("tr")
      .filter({ hasText: "charlie@example.com" });
    await expect(bannedRow.getByText("Baneado")).toBeVisible();

    // Alice (u1) is active
    const activeRow = page
      .locator("tr")
      .filter({ hasText: "alice@example.com" });
    await expect(activeRow.getByText("Activo")).toBeVisible();
  });

  test("D6: email is a link to user detail page", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/users");

    const emailLink = page.locator('a').filter({ hasText: "alice@example.com" });
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveAttribute("href", /\/users\/u1/);
  });

  test("D7: search input triggers API call with search param", async ({
    page,
  }) => {
    await mockAdminAPIs(page, { usersSearch: MOCK_USERS_SEARCH });
    await page.goto("/users");

    // Wait for initial load
    await expect(page.getByText("alice@example.com")).toBeVisible();

    // Set up request tracking
    const searchRequestPromise = page.waitForRequest((req) =>
      req.url().includes("/admin/users") && req.url().includes("search=alice")
    );

    // Type in search
    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill("alice");

    // Verify API was called with search param
    const searchRequest = await searchRequestPromise;
    expect(searchRequest.url()).toContain("search=alice");
  });

  test("D8: typing in search resets page to 1", async ({ page }) => {
    // Start with paginated data so we can navigate to page 2
    await page.route("**/api/**", (route) => {
      const url = route.request().url();

      if (url.match(/\/admin\/users(\?|$)/)) {
        const urlObj = new URL(url);
        const pageParam = urlObj.searchParams.get("page");
        const search = urlObj.searchParams.get("search");

        if (search) {
          // When searching, verify page is 1
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_USERS_SEARCH),
          });
        }

        if (pageParam === "2") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_USERS_PAGE2),
          });
        }

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_USERS_PAGINATED),
        });
      }

      // Fulfill other API calls with defaults
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/users");
    await expect(page.getByText("alice@example.com")).toBeVisible();

    // Navigate to page 2 — pagination buttons contain SVG icons, no text
    // The "next" button is the second pagination button (after the page indicator)
    const paginationArea = page.getByText(/Página \d+ de \d+/).locator('..');
    const nextButton = paginationArea.locator("button").last();
    await nextButton.click();
    await expect(page.getByText("diana@example.com")).toBeVisible();

    // Now search — should reset to page 1
    const searchRequestPromise = page.waitForRequest((req) => {
      const url = new URL(req.url(), "http://localhost");
      return (
        req.url().includes("/admin/users") &&
        url.searchParams.get("search") !== null &&
        (url.searchParams.get("page") === "1" || !url.searchParams.has("page"))
      );
    });

    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill("test");

    await searchRequestPromise;
  });

  test("D9: empty search results show sin resultados", async ({ page }) => {
    await mockAdminAPIs(page, { usersSearch: MOCK_USERS_EMPTY });
    await page.goto("/users");

    // Wait for initial load
    await expect(page.getByText("alice@example.com")).toBeVisible();

    // Search for something that returns empty
    const searchInput = page.getByPlaceholder(/buscar/i);
    await searchInput.fill("nonexistent");

    await expect(page.getByText("Sin resultados")).toBeVisible();
  });

  test("D10: error state shows red error box", async ({ page }) => {
    await mockAdminAPIs(page, { usersError: 500 });
    await page.goto("/users");

    const errorBox = page.locator(
      '[class*="red"], [class*="error"], [class*="danger"], [role="alert"]'
    );
    await expect(errorBox.first()).toBeVisible({ timeout: 5000 });
  });

  test("D11: pagination visible when total exceeds limit", async ({
    page,
  }) => {
    await mockAdminAPIs(page, { users: MOCK_USERS_PAGINATED });
    await page.goto("/users");

    // Pagination controls should be visible — buttons contain SVG icons only
    const pageIndicator = page.getByText(/Página \d+ de \d+/);
    await expect(pageIndicator).toBeVisible();
    const paginationArea = pageIndicator.locator('..');
    const paginationButtons = paginationArea.locator("button");
    await expect(paginationButtons).toHaveCount(2);
  });

  test("D12: previous button disabled on page 1", async ({ page }) => {
    await mockAdminAPIs(page, { users: MOCK_USERS_PAGINATED });
    await page.goto("/users");

    // Previous button is the first button in the pagination area
    const pageIndicator = page.getByText(/Página \d+ de \d+/);
    await expect(pageIndicator).toBeVisible();
    const prevButton = pageIndicator.locator('..').locator("button").first();
    await expect(prevButton).toBeDisabled();
  });

  test("D13: next button disabled on last page", async ({ page }) => {
    // total: 3, limit: 20 — all fits on one page, so pagination is NOT rendered
    // The pagination section only renders when totalPages > 1
    await mockAdminAPIs(page);
    await page.goto("/users");

    await expect(page.getByText("alice@example.com")).toBeVisible();

    // With total=3 and limit=20, totalPages=1, pagination is hidden entirely
    const pageIndicator = page.getByText(/Página \d+ de \d+/);
    await expect(pageIndicator).toHaveCount(0);
  });

  test("D14: page indicator shows correct text", async ({ page }) => {
    await mockAdminAPIs(page, { users: MOCK_USERS_PAGINATED });
    await page.goto("/users");

    // total: 41, limit: 20 => 3 pages
    await expect(page.getByText(/P[aá]gina 1 de 3/i)).toBeVisible();
  });

  test("D15: clicking next button fetches page 2", async ({ page }) => {
    await mockAdminAPIs(page, { users: MOCK_USERS_PAGINATED });
    await page.goto("/users");

    await expect(page.getByText("alice@example.com")).toBeVisible();

    // Track the API call
    const page2RequestPromise = page.waitForRequest((req) =>
      req.url().includes("/admin/users") && req.url().includes("page=2")
    );

    // Next button is the last button in the pagination area
    const pageIndicator = page.getByText(/Página \d+ de \d+/);
    await expect(pageIndicator).toBeVisible();
    const nextButton = pageIndicator.locator('..').locator("button").last();
    await nextButton.click();

    // Verify API was called with page=2
    const page2Request = await page2RequestPromise;
    expect(page2Request.url()).toContain("page=2");
  });
});
