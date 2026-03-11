/**
 * E2E Browser Tests: Real Stripe Checkout Flow
 *
 * Tests the full billing upgrade flow through real Stripe Checkout.
 * Uses test card 4242 4242 4242 4242 on Stripe's hosted checkout page.
 *
 * Prerequisites:
 * - Backend running on localhost:3003 with CLERK_TEST_MODE=true
 * - Frontend running on localhost:3002 with NEXT_PUBLIC_E2E_TESTING=true
 * - Stripe CLI forwarding webhooks: stripe listen --forward-to localhost:3003/api/webhooks/stripe
 * - Stripe test mode keys configured in backend .env
 */

import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:3003/api";
// Use a unique clerkId per run to avoid "already subscribed" conflicts
const TEST_CLERK_ID = `e2e_stripe_${Date.now()}`;
const AUTH_TOKEN = `e2e-test-token:${TEST_CLERK_ID}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Intercept all frontend→backend requests to inject the e2e auth token.
 * Without this, fetchAPI() sends no Authorization header in e2e mode.
 */
async function injectAuthHeader(page: any) {
  await page.route("**/api/**", (route: any) => {
    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${AUTH_TOKEN}`,
    };
    route.continue({ headers });
  });
}

/**
 * Call backend API directly with auth token.
 */
async function backendAPI(request: any, endpoint: string, options: any = {}) {
  return request.fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...options.headers,
    },
  });
}

// Set bypass cookie before every test so useAuth() returns a mock user
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "__e2e_bypass", value: "1", domain: "localhost", path: "/" },
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE CHECKOUT FLOW
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Stripe Checkout — real flow", () => {
  // Longer timeout for Stripe interactions
  test.setTimeout(120_000);

  test("1. Backend creates checkout session and returns valid Stripe URL", async ({
    request,
  }) => {
    // Ensure user + subscription exist (auto-provisioned by CLERK_TEST_MODE)
    const subRes = await backendAPI(request, "/billing/subscription");
    expect(subRes.ok()).toBeTruthy();

    const sub = await subRes.json();
    expect(sub.tier).toBe("starter");
    expect(sub.stripeCustomerId).toBeTruthy();

    // Create checkout session
    const checkoutRes = await backendAPI(request, "/billing/checkout", {
      method: "POST",
      data: JSON.stringify({ priceKey: "pro_monthly" }),
    });
    expect(checkoutRes.ok()).toBeTruthy();

    const { url, sessionId } = await checkoutRes.json();
    expect(url).toContain("checkout.stripe.com");
    expect(sessionId).toBeTruthy();
  });

  test("2. Full checkout flow: billing page → Stripe → success page", async ({
    page,
  }) => {
    await injectAuthHeader(page);

    // Navigate to billing page
    await page.goto("/dashboard/billing");
    await page.waitForSelector("text=Starter", { timeout: 20000 });

    // Should see "Actualizar a Pro" button
    const upgradeBtn = page.locator("button:has-text('Actualizar a Pro')");
    await expect(upgradeBtn).toBeVisible();

    // Click monthly toggle first (default is yearly)
    const monthlyBtn = page.locator("button:has-text('Mensual')");
    await monthlyBtn.click();
    await page.waitForTimeout(500);

    // Click upgrade — this triggers a real Stripe Checkout session
    // The frontend does window.location.href = url, so we wait for navigation
    await upgradeBtn.click();

    // Wait for redirect to Stripe Checkout
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });

    // We're now on Stripe's hosted checkout page
    // Fill in test card details
    // Stripe Checkout uses iframes, so we need to handle them carefully

    // Wait for the payment form to load
    await page.waitForSelector('[data-testid="hosted-payment-submit-button"]', {
      timeout: 30000,
    }).catch(() => {
      // Fallback: Stripe may use different selectors
    });

    // Fill email (Stripe requires it for new customers)
    const emailInput = page.locator('input[name="email"], input[id="email"]');
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill("e2e-stripe@test.margn.es");
    }

    // Fill card number — Stripe embeds card inputs in iframes
    // In newer Stripe Checkout, card fields may be directly on the page
    const cardInput = page.locator(
      'input[name="cardNumber"], input[placeholder*="1234"]'
    );
    if (await cardInput.isVisible().catch(() => false)) {
      await cardInput.fill("4242424242424242");

      // Expiry
      const expiryInput = page.locator(
        'input[name="cardExpiry"], input[placeholder*="MM"]'
      );
      await expiryInput.fill("12/30");

      // CVC
      const cvcInput = page.locator(
        'input[name="cardCvc"], input[placeholder*="CVC"]'
      );
      await cvcInput.fill("123");
    } else {
      // Stripe Checkout may use a different layout with combined card element
      // Try the unified card input approach
      await page.waitForTimeout(3000);

      // Look for iframe-based card inputs (Stripe Elements)
      const frames = page.frames();
      for (const frame of frames) {
        const cardNumberInput = frame.locator(
          'input[name="cardnumber"], input[data-elements-stable-field-name="cardNumber"]'
        );
        if (await cardNumberInput.isVisible().catch(() => false)) {
          await cardNumberInput.fill("4242 4242 4242 4242");

          const expInput = frame.locator(
            'input[name="exp-date"], input[data-elements-stable-field-name="cardExpiry"]'
          );
          await expInput.fill("12 / 30");

          const cvcInput2 = frame.locator(
            'input[name="cvc"], input[data-elements-stable-field-name="cardCvc"]'
          );
          await cvcInput2.fill("123");
          break;
        }
      }
    }

    // Fill name on card if visible
    const nameInput = page.locator(
      'input[name="billingName"], input[placeholder*="Name"]'
    );
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("E2E Test User");
    }

    // Submit payment
    const submitBtn = page.locator(
      '[data-testid="hosted-payment-submit-button"], button[type="submit"]:has-text("Subscribe"), button:has-text("Pay"), button:has-text("Subscribe")'
    );
    await submitBtn.first().click();

    // Wait for redirect back to our app (billing-success page)
    await page.waitForURL(/billing-success/, { timeout: 60000 });

    // Verify success page content
    await expect(
      page.locator("text=/activado|suscripción|[Éé]xito/i").first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("3. After checkout, subscription is upgraded to Pro", async ({
    request,
    page,
  }) => {
    // Give webhook time to process (Stripe CLI → backend)
    await page.waitForTimeout(5000);

    // Check subscription via API
    const subRes = await backendAPI(request, "/billing/subscription");
    expect(subRes.ok()).toBeTruthy();

    const sub = await subRes.json();
    // After checkout with trial, status may be 'trialing' or 'active'
    expect(["active", "trialing"]).toContain(sub.status);
    expect(sub.tier).toBe("pro");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT API VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Checkout API validation", () => {
  // Use a separate starter user for API validation (the main user is Pro after test 2)
  const VALIDATION_TOKEN = `e2e-test-token:e2e_stripe_validation_${Date.now()}`;

  function validationAPI(request: any, endpoint: string, options: any = {}) {
    return request.fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VALIDATION_TOKEN}`,
        ...options.headers,
      },
    });
  }

  test("4. Invalid price key returns 400", async ({ request }) => {
    const res = await validationAPI(request, "/billing/checkout", {
      method: "POST",
      data: JSON.stringify({ priceKey: "invalid_key" }),
    });
    expect(res.status()).toBe(400);
  });

  test("5. All price keys create valid sessions", async ({ request }) => {
    for (const priceKey of [
      "pro_monthly",
      "pro_yearly",
      "institutional_monthly",
      "institutional_yearly",
    ]) {
      const res = await validationAPI(request, "/billing/checkout", {
        method: "POST",
        data: JSON.stringify({ priceKey }),
      });
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      expect(body.url).toContain("checkout.stripe.com");
    }
  });

  test("6. Subscription endpoint returns tier limits", async ({ request }) => {
    const res = await validationAPI(request, "/billing/subscription");
    const sub = await res.json();

    expect(sub).toHaveProperty("tier");
    expect(sub).toHaveProperty("limits");
    expect(sub.limits).toHaveProperty("maxPortfolios");
    expect(sub.limits).toHaveProperty("rebalanceSharpeEnabled");
  });
});
