import { test, expect } from "@playwright/test";
import { mockAdminAPIs, setBypassCookie } from "./helpers";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/" },
  { label: "Usuarios", path: "/users" },
  { label: "Suscripciones", path: "/subscriptions" },
  { label: "Vouchers", path: "/vouchers" },
  { label: "Operaciones", path: "/operations" },
  { label: "Audit Log", path: "/audit-logs" },
];

test.describe("Sidebar & Navigation", () => {
  test.beforeEach(async ({ page, context }) => {
    await setBypassCookie(context);
    await mockAdminAPIs(page);
  });

  test("B1. Sidebar renders all 6 nav items", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const item of NAV_ITEMS) {
      const navLink = page.locator(`a:has-text("${item.label}")`);
      await expect(navLink).toBeVisible({ timeout: 5000 });
    }
  });

  test('B2. Sidebar logo shows "Margn Admin" text', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const logo = page.locator("text=Margn Admin");
    await expect(logo).toBeVisible({ timeout: 5000 });
  });

  test("B3. Clicking each nav item navigates to correct URL", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const item of NAV_ITEMS) {
      const navLink = page.locator(`a[href="${item.path}"]`);
      await expect(navLink).toBeVisible({ timeout: 5000 });
      await navLink.click();

      // Wait for navigation to complete
      await page.waitForURL(`**${item.path}`, { timeout: 5000 });
      const pathname = new URL(page.url()).pathname;

      if (item.path === "/") {
        expect(pathname).toBe("/");
      } else {
        expect(pathname).toBe(item.path);
      }
    }
  });

  test("B4. Active nav item on dashboard (/) has blue color", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const dashboardLink = page.locator('a[href="/"]');
    await expect(dashboardLink).toBeVisible({ timeout: 5000 });

    // Active items have color #60a5fa (blue) and background with blue tint
    const color = await dashboardLink.evaluate(
      (el) => getComputedStyle(el).color
    );
    // #60a5fa = rgb(96, 165, 250)
    expect(color).toBe("rgb(96, 165, 250)");
  });

  test("B5. Active nav item on /users has blue color, others do not", async ({
    page,
  }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");

    // Users link should be active (blue) - use text selector for robustness
    const usersLink = page.locator('a:has-text("Usuarios")');
    await expect(usersLink).toBeVisible({ timeout: 5000 });
    const usersColor = await usersLink.evaluate(
      (el) => getComputedStyle(el).color
    );
    expect(usersColor).toBe("rgb(96, 165, 250)");

    // Dashboard link should NOT be active (should be grey #94a3b8)
    const dashboardLink = page.locator('a:has-text("Dashboard")');
    const dashColor = await dashboardLink.evaluate(
      (el) => getComputedStyle(el).color
    );
    // #94a3b8 = rgb(148, 163, 184)
    expect(dashColor).toBe("rgb(148, 163, 184)");
  });

  test('B6. Sign Out button "Cerrar Sesion" is visible', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const signOutBtn = page.locator("button:has-text('Cerrar Sesion')");
    await expect(signOutBtn).toBeVisible({ timeout: 5000 });
  });

  test("B7. Sign Out button is in sidebar footer (bottom section)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const signOutBtn = page.locator("button:has-text('Cerrar Sesion')");
    await expect(signOutBtn).toBeVisible({ timeout: 5000 });

    // The sign out button's parent div has borderTop (footer separator)
    const parentBorderTop = await signOutBtn.evaluate((el) => {
      const parent = el.parentElement;
      return parent ? getComputedStyle(parent).borderTopStyle : "none";
    });
    expect(parentBorderTop).toBe("solid");
  });

  test("B8. Sidebar is fixed positioned with height 100vh", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The sidebar contains the "Margn Admin" logo and has position: fixed
    // React inline styles render as "position: fixed;" with varied spacing
    const sidebar = page.locator('div:has(> div > span:has-text("Margn Admin"))').first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    const position = await sidebar.evaluate(
      (el) => getComputedStyle(el).position
    );
    expect(position).toBe("fixed");

    const height = await sidebar.evaluate(
      (el) => getComputedStyle(el).height
    );
    // 100vh should equal the viewport height (Playwright default 720px)
    const viewportHeight = page.viewportSize()?.height ?? 720;
    expect(parseInt(height)).toBe(viewportHeight);
  });

  test("B9. Content area has marginLeft 240px", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The main content area contains the h1 title and has marginLeft: 240px
    // Use the h1 to find the content container
    const content = page.locator('h1:has-text("Dashboard")').locator('..');
    await expect(content).toBeVisible({ timeout: 5000 });

    const marginLeft = await content.evaluate(
      (el) => getComputedStyle(el).marginLeft
    );
    expect(marginLeft).toBe("240px");
  });

  test("B10. Page title renders correctly on dashboard, users, subscriptions", async ({
    page,
  }) => {
    const pages = [
      { path: "/", title: "Dashboard" },
      { path: "/users", title: "Usuarios" },
      { path: "/subscriptions", title: "Suscripciones" },
    ];

    for (const p of pages) {
      await page.goto(p.path);
      await page.waitForLoadState("networkidle");

      // The title is rendered as an h1 inside the main content area
      const heading = page.locator("h1");
      await expect(heading).toBeVisible({ timeout: 5000 });
      await expect(heading).toHaveText(p.title);
    }
  });
});
