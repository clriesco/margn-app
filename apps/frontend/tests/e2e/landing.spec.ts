import { test, expect } from "@playwright/test";

const LANDING_URL = "http://localhost:4000";

test.describe("Landing Page - Homepage sections", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LANDING_URL);
  });

  test("all main sections are visible on homepage", async ({ page }) => {
    // Navbar
    await expect(page.locator("nav#navbar")).toBeVisible();

    // Hero - headline
    await expect(
      page.getByRole("heading", { name: "Tu apalancamiento. Bajo" })
    ).toBeVisible();

    // Features section
    await expect(page.locator("#funcionalidades")).toBeVisible();

    // Metrics section - identified by heading
    await expect(
      page.getByText("Los números detrás de la estrategia")
    ).toBeVisible();

    // Comparison section - identified by heading
    await expect(
      page.getByText("El mismo portfolio. Distinta gestión.")
    ).toBeVisible();

    // HowItWorks section
    await expect(page.locator("#como-funciona")).toBeVisible();

    // Pricing section
    await expect(page.locator("#precios")).toBeVisible();

    // FAQ section
    await expect(page.locator("#faq")).toBeVisible();

    // CTA section - identified by heading
    await expect(
      page.getByText("Deja de adivinar tu apalancamiento.")
    ).toBeVisible();

    // Footer
    await expect(page.locator("footer")).toBeVisible();
  });

  test("hero stats are visible (4 stats)", async ({ page }) => {
    const stats = page.locator("section").first().locator(".grid.grid-cols-2 > div");
    // The hero stats grid: ~80%, 0, 14x, $213K
    await expect(page.getByText("~80%")).toBeVisible();
    await expect(page.getByText("Margin calls").first()).toBeVisible();
    await expect(page.getByText("14x", { exact: true })).toBeVisible();
    await expect(page.getByText("$213K", { exact: true })).toBeVisible();
  });

  test("features section shows 8 feature cards", async ({ page }) => {
    const featureCards = page.locator(
      "#funcionalidades .grid > div"
    );
    await expect(featureCards).toHaveCount(8);

    // Verify some feature titles are present
    const featuresSection = page.locator("#funcionalidades");
    await expect(featuresSection.getByRole("heading", { name: "Optimización de pesos" })).toBeVisible();
    await expect(featuresSection.getByRole("heading", { name: "DCA condicional" })).toBeVisible();
    await expect(featuresSection.getByRole("heading", { name: "Protección de margen" })).toBeVisible();
  });

  test("HowItWorks shows 4 steps", async ({ page }) => {
    const steps = page.locator("#como-funciona .grid > div");
    await expect(steps).toHaveCount(4);

    // Verify step numbers
    await expect(page.locator("#como-funciona").getByText("01")).toBeVisible();
    await expect(page.locator("#como-funciona").getByText("02")).toBeVisible();
    await expect(page.locator("#como-funciona").getByText("03")).toBeVisible();
    await expect(page.locator("#como-funciona").getByText("04")).toBeVisible();
  });
});

test.describe("Landing Page - Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LANDING_URL);
  });

  test("navbar links work (anchor scrolling)", async ({ page }) => {
    // Click "Funcionalidades" nav link
    const desktopNav = page.locator(".hidden.md\\:flex");
    await desktopNav.getByText("Funcionalidades").click();
    await expect(page).toHaveURL(`${LANDING_URL}/#funcionalidades`);

    // Click "Cómo funciona" nav link
    await desktopNav.getByText("Cómo funciona").click();
    await expect(page).toHaveURL(`${LANDING_URL}/#como-funciona`);

    // Click "Precios" nav link
    await desktopNav.getByText("Precios").click();
    await expect(page).toHaveURL(`${LANDING_URL}/#precios`);

    // Click "FAQ" nav link
    await desktopNav.getByText("FAQ").click();
    await expect(page).toHaveURL(`${LANDING_URL}/#faq`);
  });

  test("all CTA buttons have correct href to app.margn.es", async ({
    page,
  }) => {
    // Navbar CTAs
    await expect(
      page.locator("nav").getByRole("link", { name: "Iniciar sesión" })
    ).toHaveAttribute("href", "https://app.margn.es");
    await expect(
      page.locator("nav").getByRole("link", { name: "Empezar gratis" })
    ).toHaveAttribute("href", "https://app.margn.es");

    // Hero CTA
    await expect(
      page.getByRole("link", { name: "Empieza gratis" })
    ).toHaveAttribute("href", "https://app.margn.es");

    // Pricing CTAs - Starter and Pro go to app, Institucional goes to mailto
    const pricingSection = page.locator("#precios");
    await expect(
      pricingSection.getByRole("link", { name: "Empezar gratis" })
    ).toHaveAttribute("href", "https://app.margn.es");
    await expect(
      pricingSection.getByRole("link", { name: "Prueba 14 días gratis" })
    ).toHaveAttribute("href", "https://app.margn.es");
    await expect(
      pricingSection.getByRole("link", { name: "Contactar" })
    ).toHaveAttribute("href", "mailto:hello@margn.es");

    // Final CTA section
    await expect(
      page.getByRole("link", { name: "Crea tu cuenta gratuita" })
    ).toHaveAttribute("href", "https://app.margn.es");
  });
});

test.describe("Landing Page - Pricing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LANDING_URL);
  });

  test("all 3 pricing tiers visible with correct monthly prices", async ({
    page,
  }) => {
    const pricingSection = page.locator("#precios");

    // Tier names
    await expect(pricingSection.getByRole("heading", { name: "Starter" })).toBeVisible();
    await expect(pricingSection.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
    await expect(pricingSection.getByRole("heading", { name: "Institucional" })).toBeVisible();

    // Default monthly prices - Starter shows "Gratis"
    await expect(pricingSection.getByText("Gratis", { exact: true })).toBeVisible();

    // Price values should show monthly by default
    const priceValues = pricingSection.locator(".price-value");
    await expect(priceValues).toHaveCount(2); // Pro and Institucional
    await expect(priceValues.nth(0)).toHaveText("19");
    await expect(priceValues.nth(1)).toHaveText("49");
  });

  test("pricing toggle switches between monthly/yearly prices", async ({
    page,
  }) => {
    const pricingSection = page.locator("#precios");
    const priceValues = pricingSection.locator(".price-value");
    const billingToggle = page.locator("#billing-toggle");

    // Verify monthly prices (default)
    await expect(priceValues.nth(0)).toHaveText("19");
    await expect(priceValues.nth(1)).toHaveText("49");

    // Annual notes should be hidden by default
    const annualNotes = pricingSection.locator(".annual-note");
    for (let i = 0; i < (await annualNotes.count()); i++) {
      await expect(annualNotes.nth(i)).toBeHidden();
    }

    // Click toggle to switch to annual
    await billingToggle.click();

    // Verify annual prices
    await expect(priceValues.nth(0)).toHaveText("15");
    await expect(priceValues.nth(1)).toHaveText("39");

    // Annual notes should be visible now
    for (let i = 0; i < (await annualNotes.count()); i++) {
      await expect(annualNotes.nth(i)).toBeVisible();
    }

    // Toggle back to monthly
    await billingToggle.click();
    await expect(priceValues.nth(0)).toHaveText("19");
    await expect(priceValues.nth(1)).toHaveText("49");
  });
});

test.describe("Landing Page - FAQ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LANDING_URL);
  });

  test("FAQ items expand/collapse", async ({ page }) => {
    const faqSection = page.locator("#faq");
    const details = faqSection.locator("details");

    // There should be 11 FAQ items
    await expect(details).toHaveCount(11);

    // First FAQ should be collapsed by default
    const firstDetails = details.first();
    await expect(firstDetails).not.toHaveAttribute("open", "");

    // The answer text should be hidden
    const firstAnswer = firstDetails.locator("div.px-6.pb-5");
    await expect(firstAnswer).toBeHidden();

    // Click to expand
    await firstDetails.locator("summary").click();

    // Now the answer should be visible
    await expect(firstAnswer).toBeVisible();
    await expect(firstAnswer).toContainText(
      "Margn es una herramienta de cálculo"
    );

    // Click again to collapse
    await firstDetails.locator("summary").click();
    await expect(firstAnswer).toBeHidden();
  });
});

test.describe("Landing Page - Footer links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LANDING_URL);
  });

  test("footer links to /about, /privacy, /terms exist", async ({ page }) => {
    const footer = page.locator("footer");

    await expect(
      footer.getByRole("link", { name: "Sobre nosotros" })
    ).toHaveAttribute("href", "/about");
    await expect(
      footer.getByRole("link", { name: "Política de Privacidad" })
    ).toHaveAttribute("href", "/privacy");
    await expect(
      footer.getByRole("link", { name: "Términos de Servicio" })
    ).toHaveAttribute("href", "/terms");
  });

  test("footer contains legal disclaimer", async ({ page }) => {
    await expect(
      page.locator("footer").getByText("No es un asesor de inversiones", { exact: false })
    ).toBeVisible();
  });
});

test.describe("Landing Page - Legal pages", () => {
  test("/about page loads with content", async ({ page }) => {
    await page.goto(`${LANDING_URL}/about`);
    await expect(page).toHaveTitle(/Sobre Margn/);
    await expect(page.getByText("Qué es Margn")).toBeVisible();
    await expect(
      page.getByText("herramienta de cálculo, optimización y visualización", {
        exact: false,
      })
    ).toBeVisible();
  });

  test("/privacy page loads with content", async ({ page }) => {
    await page.goto(`${LANDING_URL}/privacy`);
    await expect(page.locator("body")).toContainText("Privacidad");
  });

  test("/terms page loads with content", async ({ page }) => {
    await page.goto(`${LANDING_URL}/terms`);
    await expect(page.locator("body")).toContainText("Términos");
  });
});

test.describe("Landing Page - Mobile menu", () => {
  test("mobile menu opens and shows nav links", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(LANDING_URL);

    const mobileMenu = page.locator("#mobile-menu");
    const menuButton = page.locator("#mobile-menu-btn");

    // Mobile menu should be hidden initially
    await expect(mobileMenu).toBeHidden();

    // Click hamburger button
    await menuButton.click();

    // Mobile menu should be visible
    await expect(mobileMenu).toBeVisible();

    // All nav links should be present in mobile menu
    await expect(mobileMenu.getByText("Funcionalidades")).toBeVisible();
    await expect(mobileMenu.getByText("Cómo funciona")).toBeVisible();
    await expect(mobileMenu.getByText("Precios")).toBeVisible();
    await expect(mobileMenu.getByText("FAQ")).toBeVisible();
    await expect(mobileMenu.getByText("Iniciar sesión")).toBeVisible();

    // Clicking a link should close the menu
    await mobileMenu.getByText("Funcionalidades").click();
    await expect(mobileMenu).toBeHidden();
  });
});
