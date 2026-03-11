import { test, expect } from "@playwright/test";
import {
  mockAdminAPIs,
  setBypassCookie,
  MOCK_VOUCHERS,
} from "./helpers";

test.describe("Vouchers", () => {
  test.beforeEach(async ({ context }) => {
    await setBypassCookie(context);
  });

  test("G1: renders table with correct headers", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    for (const header of ["Codigo", "Tipo", "Beneficio", "Usos", "Duracion", "Expira", "Estado"]) {
      await expect(page.locator("th", { hasText: header })).toBeVisible();
    }
  });

  test("G2: active voucher shows green Activo badge", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    const activoBadges = page.locator("span", { hasText: "Activo" });
    await expect(activoBadges.first()).toBeVisible();
    const color = await activoBadges.first().evaluate((el) => getComputedStyle(el).color);
    expect(color).toContain("52, 211, 153");
  });

  test("G3: inactive voucher (UPGRADE1) shows red Inactivo badge", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    const row = page.locator("tr", { hasText: "UPGRADE1" });
    const badge = row.locator("span", { hasText: "Inactivo" });
    await expect(badge).toBeVisible();
    const color = await badge.evaluate((el) => getComputedStyle(el).color);
    expect(color).toContain("248, 113, 113");
  });

  test("G4: benefit column formatted correctly per voucher type", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    // PROMO50 = discount_percent → "50%"
    const promo50Row = page.locator("tr", { hasText: "PROMO50" });
    await expect(promo50Row.locator("td").nth(2)).toHaveText("50%");

    // TRIAL30 = trial_extension → "30 días"
    const trial30Row = page.locator("tr", { hasText: "TRIAL30" });
    await expect(trial30Row.locator("td").nth(2)).toHaveText("30 días");

    // UPGRADE1 = tier_upgrade → "→ pro"
    const upgrade1Row = page.locator("tr", { hasText: "UPGRADE1" });
    await expect(upgrade1Row.locator("td").nth(2)).toHaveText("→ pro");
  });

  test("G5: usage column shows correct counts", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    // PROMO50: 12 / 100
    const promo50Row = page.locator("tr", { hasText: "PROMO50" });
    await expect(promo50Row.locator("td").nth(3)).toHaveText("12 / 100");

    // TRIAL30: 5 (no max)
    const trial30Row = page.locator("tr", { hasText: "TRIAL30" });
    await expect(trial30Row.locator("td").nth(3)).toHaveText("5");
  });

  test("G6: duration column shows correct values", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    // PROMO50: null → "Permanente"
    const promo50Row = page.locator("tr", { hasText: "PROMO50" });
    await expect(promo50Row.locator("td").nth(4)).toHaveText("Permanente");

    // UPGRADE1: 12 months → "1 año"
    const upgrade1Row = page.locator("tr", { hasText: "UPGRADE1" });
    await expect(upgrade1Row.locator("td").nth(4)).toHaveText("1 año");
  });

  test("G7: Crear Voucher button toggles form visibility", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    const createBtn = page.getByRole("button", { name: /Crear Voucher/i });
    const formHeading = page.getByText("Nuevo Voucher");

    await expect(formHeading).not.toBeVisible();
    await createBtn.click();
    await expect(formHeading).toBeVisible();

    // Button now says "Cancelar"
    await page.getByRole("button", { name: /Cancelar/i }).click();
    await expect(formHeading).not.toBeVisible();
  });

  test("G8: form shows type-specific fields", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await page.getByRole("button", { name: /Crear Voucher/i }).click();

    // Default type is discount_percent → shows "Descuento (%)"
    await expect(page.locator("label", { hasText: "Descuento (%)" })).toBeVisible();

    // Switch to tier_upgrade → shows "Tier a otorgar"
    const typeSelect = page.locator("label", { hasText: "Tipo" }).locator("..").locator("select");
    await typeSelect.selectOption("tier_upgrade");
    await expect(page.locator("label", { hasText: "Tier a otorgar" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Descuento (%)" })).not.toBeVisible();

    // Switch to trial_extension → shows "Dias de trial"
    await typeSelect.selectOption("trial_extension");
    await expect(page.locator("label", { hasText: "Dias de trial" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Tier a otorgar" })).not.toBeVisible();

    // Switch to discount_fixed → shows "Descuento (EUR)"
    await typeSelect.selectOption("discount_fixed");
    await expect(page.locator("label", { hasText: "Descuento (EUR)" })).toBeVisible();
  });

  test("G9: create button disabled when form invalid", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await page.getByRole("button", { name: /Crear Voucher/i }).click();

    const submitBtn = page.getByRole("button", { name: "Crear Voucher", exact: true });

    // Empty code → disabled
    await expect(submitBtn).toBeDisabled();

    // Fill code but no value → still disabled
    const codeInput = page.locator("label", { hasText: "Codigo" }).locator("..").locator("input");
    await codeInput.fill("TEST");
    await expect(submitBtn).toBeDisabled();

    // Fill valid discount → enabled
    const discountInput = page.locator("label", { hasText: "Descuento (%)" }).locator("..").locator("input");
    await discountInput.fill("25");
    await expect(submitBtn).toBeEnabled();
  });

  test("G10: submit create form calls POST with correct schema", async ({ page }) => {
    let capturedBody: any = null;

    await mockAdminAPIs(page);

    await page.route("**/api/admin/vouchers", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "v-new", code: "TEST25" }),
        });
      }
      return route.fallback();
    });

    await page.goto("/vouchers");
    await page.getByRole("button", { name: /Crear Voucher/i }).click();

    // Fill form: discount_percent voucher
    await page.locator("label", { hasText: "Codigo" }).locator("..").locator("input").fill("TEST25");
    await page.locator("label", { hasText: "Descuento (%)" }).locator("..").locator("input").fill("25");
    await page.locator("label", { hasText: "Maximo usos" }).locator("..").locator("input").fill("100");

    await page.getByRole("button", { name: "Crear Voucher", exact: true }).click();

    await page.waitForTimeout(500);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.code).toBe("TEST25");
    expect(capturedBody.type).toBe("discount_percent");
    expect(capturedBody.discountPercent).toBe(25);
    expect(capturedBody.maxRedemptions).toBe(100);
  });

  test("G11: success toast appears and form hides after creation", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await page.getByRole("button", { name: /Crear Voucher/i }).click();
    await expect(page.getByText("Nuevo Voucher")).toBeVisible();

    await page.locator("label", { hasText: "Codigo" }).locator("..").locator("input").fill("TEST");
    await page.locator("label", { hasText: "Descuento (%)" }).locator("..").locator("input").fill("10");

    await page.getByRole("button", { name: "Crear Voucher", exact: true }).click();

    // Toast appears
    await expect(page.locator("[role='alert']", { hasText: "Voucher creado." })).toBeVisible();
    await expect(page.getByText("Nuevo Voucher")).not.toBeVisible();
  });

  test("G12: active vouchers have trash, inactive have edit", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await expect(page.locator("tr", { hasText: "PROMO50" })).toBeVisible();

    // Active vouchers have trash button
    await expect(page.locator("tr", { hasText: "PROMO50" }).getByLabel("Desactivar voucher")).toBeVisible();
    await expect(page.locator("tr", { hasText: "TRIAL30" }).getByLabel("Desactivar voucher")).toBeVisible();

    // Inactive voucher has edit button
    await expect(page.locator("tr", { hasText: "UPGRADE1" }).getByLabel("Editar voucher")).toBeVisible();
  });

  test("G13: clicking trash shows inline confirm", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await expect(page.locator("tr", { hasText: "PROMO50" })).toBeVisible();
    await page.locator("tr", { hasText: "PROMO50" }).getByLabel("Desactivar voucher").click();

    // Inline confirm appears
    await expect(page.getByText("Desactivar?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();

    // Clicking "No" dismisses
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Desactivar?")).not.toBeVisible();
  });

  test("G14: confirming deactivation calls DELETE", async ({ page }) => {
    let deleteUrl = "";

    await mockAdminAPIs(page);

    await page.route("**/api/admin/vouchers/*", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteUrl = route.request().url();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
      return route.fallback();
    });

    await page.goto("/vouchers");

    await expect(page.locator("tr", { hasText: "PROMO50" })).toBeVisible();
    await page.locator("tr", { hasText: "PROMO50" }).getByLabel("Desactivar voucher").click();
    await page.getByRole("button", { name: "Confirmar" }).click();

    await page.waitForTimeout(500);
    expect(deleteUrl).toContain("/vouchers/v1");
  });

  test("G15: edit button opens form pre-filled with voucher data", async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto("/vouchers");

    await expect(page.locator("tr", { hasText: "UPGRADE1" })).toBeVisible();
    await page.locator("tr", { hasText: "UPGRADE1" }).getByLabel("Editar voucher").click();

    // Form opens with "Editar Voucher" heading
    await expect(page.getByText("Editar Voucher — UPGRADE1")).toBeVisible();

    // Code is displayed but not editable (no input)
    await expect(page.getByText("UPGRADE1").first()).toBeVisible();

    // Type is pre-filled
    const typeSelect = page.locator("label", { hasText: "Tipo" }).locator("..").locator("select");
    await expect(typeSelect).toHaveValue("tier_upgrade");

    // Submit button says "Guardar Cambios"
    await expect(page.getByRole("button", { name: "Guardar Cambios" })).toBeVisible();
  });

  test("G16: edit submit calls PUT with updated data and reactivates", async ({ page }) => {
    let capturedBody: any = null;
    let capturedUrl = "";

    await mockAdminAPIs(page);

    await page.route("**/api/admin/vouchers/*", async (route) => {
      if (route.request().method() === "PUT") {
        capturedUrl = route.request().url();
        capturedBody = JSON.parse(route.request().postData() || "{}");
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "v3", code: "UPGRADE1" }),
        });
      }
      return route.fallback();
    });

    await page.goto("/vouchers");

    await page.locator("tr", { hasText: "UPGRADE1" }).getByLabel("Editar voucher").click();
    await page.getByRole("button", { name: "Guardar Cambios" }).click();

    await page.waitForTimeout(500);
    expect(capturedUrl).toContain("/vouchers/v3");
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.isActive).toBe(true);
    expect(capturedBody.type).toBe("tier_upgrade");
  });
});
