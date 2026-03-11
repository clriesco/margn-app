import { Page } from "@playwright/test";

// ─── API Base URL ──────────────────────────────────────────────────────────
export const API_BASE = "http://localhost:3003/api";

// ─── E2E Auth Token ────────────────────────────────────────────────────────
// Backend with CLERK_TEST_MODE=true accepts "e2e-test-token:<clerkId>"
export function e2eToken(clerkId: string) {
  return `e2e-test-token:${clerkId}`;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────

export const MOCK_STATS = {
  users: { total: 142, active30d: 98, banned: 3, newThisWeek: 7 },
  subscriptions: { starter: 110, pro: 28, institutional: 4 },
  revenue: { mrr: 532.0, estimatedArr: 6384.0 },
  portfolios: { total: 87 },
};

export const MOCK_ACTIVITY = {
  recentSignups: [
    { email: "alice@example.com", createdAt: "2026-03-09T10:00:00Z" },
    { email: "bob@example.com", createdAt: "2026-03-08T14:30:00Z" },
    { email: "charlie@example.com", createdAt: "2026-03-07T09:15:00Z" },
  ],
  recentContributions: [
    { id: "c1", amount: 500, type: "monthly", contributedAt: "2026-03-09T12:00:00Z", portfolio: { name: "Main", user: { email: "alice@example.com" } } },
    { id: "c2", amount: 1200, type: "extra", contributedAt: "2026-03-08T09:00:00Z", portfolio: { name: "Crypto", user: { email: "bob@example.com" } } },
  ],
  recentRebalances: [
    { id: "r1", triggeredBy: "user", createdAt: "2026-03-09T14:00:00Z", portfolio: { name: "Main", user: { email: "alice@example.com" } } },
    { id: "r2", triggeredBy: "auto", createdAt: "2026-03-07T07:00:00Z", portfolio: { name: "Growth", user: { email: "charlie@example.com" } } },
  ],
};

export const MOCK_USERS = {
  data: [
    { id: "u1", email: "alice@example.com", fullName: "Alice Smith", subscription: { tier: "pro" }, bannedAt: null, createdAt: "2026-01-15T00:00:00Z" },
    { id: "u2", email: "bob@example.com", fullName: "Bob Jones", subscription: { tier: "starter" }, bannedAt: null, createdAt: "2026-02-20T00:00:00Z" },
    { id: "u3", email: "charlie@example.com", fullName: null, subscription: { tier: "institutional" }, bannedAt: "2026-03-01T00:00:00Z", createdAt: "2025-12-01T00:00:00Z" },
  ],
  meta: { total: 3, page: 1, limit: 20 },
};

export const MOCK_USERS_PAGE2 = {
  data: [
    { id: "u4", email: "diana@example.com", fullName: "Diana Prince", subscription: { tier: "pro" }, bannedAt: null, createdAt: "2026-03-05T00:00:00Z" },
  ],
  meta: { total: 41, page: 2, limit: 20 },
};

export const MOCK_USERS_PAGINATED = {
  data: MOCK_USERS.data,
  meta: { total: 41, page: 1, limit: 20 },
};

export const MOCK_USERS_EMPTY = {
  data: [],
  meta: { total: 0, page: 1, limit: 20 },
};

export const MOCK_USERS_SEARCH = {
  data: [MOCK_USERS.data[0]],
  meta: { total: 1, page: 1, limit: 20 },
};

export const MOCK_USER_DETAIL = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice Smith",
  role: "user",
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-03-09T10:00:00Z",
  bannedAt: null,
  banReason: null,
  subscription: { tier: "pro", status: "active", billingInterval: "monthly", currentPeriodEnd: "2026-04-15T00:00:00Z", cancelAtPeriodEnd: false, trialEnd: null, stripeCustomerId: "cus_123" },
  portfolios: [
    { id: "p1", name: "Main Portfolio", positionCount: 2, equity: 15420.50, leverage: 3.12, createdAt: "2026-01-15T00:00:00Z" },
  ],
  recentContributions: [
    { id: "c1", amount: 500, contributedAt: "2026-03-01T12:00:00Z", portfolio: { name: "Main Portfolio" } },
    { id: "c2", amount: 500, contributedAt: "2026-02-01T12:00:00Z", portfolio: { name: "Main Portfolio" } },
  ],
  counts: { portfolios: 1, strategies: 3 },
};

export const MOCK_USER_DETAIL_ADMIN = {
  ...MOCK_USER_DETAIL,
  role: "admin",
};

export const MOCK_USER_DETAIL_BANNED = {
  ...MOCK_USER_DETAIL,
  id: "u3",
  email: "charlie@example.com",
  fullName: "Charlie Brown",
  bannedAt: "2026-03-01T00:00:00Z",
  banReason: "Spam account",
  subscription: { tier: "starter", status: "active", billingInterval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEnd: null, stripeCustomerId: null },
  portfolios: [],
  recentContributions: [],
  counts: { portfolios: 0, strategies: 0 },
};

export const MOCK_SUBSCRIPTIONS = {
  data: [
    { id: "s1", userId: "u1", tier: "pro", status: "active", currentPeriodEnd: "2026-04-15T00:00:00Z", cancelAtPeriodEnd: false, user: { email: "alice@example.com" } },
    { id: "s2", userId: "u2", tier: "starter", status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false, user: { email: "bob@example.com" } },
    { id: "s3", userId: "u3", tier: "pro", status: "trialing", currentPeriodEnd: "2026-03-20T00:00:00Z", cancelAtPeriodEnd: true, user: { email: "charlie@example.com" } },
  ],
  meta: { total: 3, page: 1, limit: 20 },
};

export const MOCK_SUBSCRIPTIONS_EMPTY = {
  data: [],
  meta: { total: 0, page: 1, limit: 20 },
};

export const MOCK_VOUCHERS = {
  data: [
    { id: "v1", code: "PROMO50", type: "discount_percent", discountPercent: 50, maxRedemptions: 100, currentRedemptions: 12, durationMonths: null, expiresAt: null, isActive: true },
    { id: "v2", code: "TRIAL30", type: "trial_extension", trialDays: 30, maxRedemptions: null, currentRedemptions: 5, durationMonths: null, expiresAt: null, isActive: true },
    { id: "v3", code: "UPGRADE1", type: "tier_upgrade", tier: "pro", maxRedemptions: 50, currentRedemptions: 50, durationMonths: 12, expiresAt: "2026-01-01T00:00:00Z", isActive: false },
  ],
  meta: { total: 3, page: 1, limit: 20 },
};

export const MOCK_CRON_STATUS = [
  { jobName: "price-ingestion", lastRun: { status: "success", startedAt: "2026-03-10T06:00:00Z", finishedAt: "2026-03-10T06:00:12Z", durationMs: 12500 } },
  { jobName: "metrics-refresh", lastRun: { status: "success", startedAt: "2026-03-10T07:00:00Z", finishedAt: "2026-03-10T07:00:08Z", durationMs: 8300 } },
  { jobName: "daily-check", lastRun: { status: "failed", startedAt: "2026-03-10T09:00:00Z", finishedAt: "2026-03-10T09:00:01Z", durationMs: 1200, error: "Connection timeout" } },
];

export const MOCK_JOB_LOGS = {
  data: [
    { id: "l1", jobName: "price-ingestion", status: "success", startedAt: "2026-03-10T06:00:00Z", durationMs: 12500, summary: "45 prices updated" },
    { id: "l2", jobName: "metrics-refresh", status: "success", startedAt: "2026-03-10T07:00:00Z", durationMs: 8300, summary: "87 portfolios refreshed" },
    { id: "l3", jobName: "daily-check", status: "failed", startedAt: "2026-03-10T09:00:00Z", durationMs: 1200, error: "Connection timeout" },
  ],
  meta: { total: 3, page: 1, limit: 20 },
};

export const MOCK_JOB_LOGS_EMPTY = {
  data: [],
  meta: { total: 0, page: 1, limit: 20 },
};

export const MOCK_AUDIT_LOGS = {
  data: [
    { id: "a1", adminId: "admin1", admin: { email: "admin@margn.es" }, action: "user.ban", targetType: "user", targetId: "u3", details: "{\"reason\":\"Spam account\"}", createdAt: "2026-03-09T15:00:00Z" },
    { id: "a2", adminId: "admin1", admin: { email: "admin@margn.es" }, action: "subscription.override_tier", targetType: "subscription", targetId: "u1", details: "{\"before\":{\"tier\":\"starter\",\"status\":\"active\"},\"after\":{\"tier\":\"pro\"}}", createdAt: "2026-03-08T10:00:00Z" },
    { id: "a3", adminId: "admin1", admin: { email: "admin@margn.es" }, action: "voucher.create", targetType: "voucher", targetId: "v1", details: "{\"code\":\"PROMO50\",\"type\":\"discount_percent\"}", createdAt: "2026-03-07T12:00:00Z" },
    { id: "a4", adminId: "admin1", admin: { email: "admin@margn.es" }, action: "cron.trigger", targetType: "cron", targetId: null, details: "{\"jobName\":\"price-ingestion\"}", createdAt: "2026-03-06T08:00:00Z" },
  ],
  meta: { total: 4, page: 1, limit: 50 },
};

export const MOCK_AUDIT_LOGS_EMPTY = {
  data: [],
  meta: { total: 0, page: 1, limit: 50 },
};

// ─── Route Interceptor ─────────────────────────────────────────────────────

export interface MockOverrides {
  stats?: unknown;
  activity?: unknown;
  users?: unknown;
  usersSearch?: unknown;
  userDetail?: unknown;
  subscriptions?: unknown;
  vouchers?: unknown;
  cronStatus?: unknown;
  jobLogs?: unknown;
  auditLogs?: unknown;
  // Error overrides: set to a status code to simulate errors
  statsError?: number;
  activityError?: number;
  usersError?: number;
  userDetailError?: number;
  subscriptionsError?: number;
  vouchersError?: number;
  cronStatusError?: number;
  jobLogsError?: number;
  auditLogsError?: number;
}

export async function mockAdminAPIs(page: Page, overrides: MockOverrides = {}) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Dashboard stats
    if (url.includes("/admin/dashboard/stats")) {
      if (overrides.statsError) {
        return route.fulfill({ status: overrides.statsError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.stats ?? MOCK_STATS) });
    }

    // Dashboard activity
    if (url.includes("/admin/dashboard/activity")) {
      if (overrides.activityError) {
        return route.fulfill({ status: overrides.activityError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.activity ?? MOCK_ACTIVITY) });
    }

    // User actions: role, ban, unban
    if (url.match(/\/admin\/users\/[^/?]+\/(role|ban|unban)$/)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }

    // Subscription actions: override tier, extend trial, comp
    if (url.match(/\/admin\/subscriptions\/[^/?]+/) && method !== "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }

    // User detail
    if (url.match(/\/admin\/users\/[^/?]+$/)) {
      if (overrides.userDetailError) {
        return route.fulfill({ status: overrides.userDetailError, contentType: "application/json", body: JSON.stringify({ message: "Not found" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.userDetail ?? MOCK_USER_DETAIL) });
    }

    // Users list
    if (url.match(/\/admin\/users(\?|$)/)) {
      if (overrides.usersError) {
        return route.fulfill({ status: overrides.usersError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      const urlObj = new URL(url);
      const search = urlObj.searchParams.get("search");
      if (search && overrides.usersSearch) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.usersSearch) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.users ?? MOCK_USERS) });
    }

    // Subscriptions list
    if (url.match(/\/admin\/subscriptions(\?|$)/) && method === "GET") {
      if (overrides.subscriptionsError) {
        return route.fulfill({ status: overrides.subscriptionsError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.subscriptions ?? MOCK_SUBSCRIPTIONS) });
    }

    // Voucher create
    if (url.match(/\/admin\/vouchers$/) && method === "POST") {
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "v-new", code: "NEW" }) });
    }

    // Voucher deactivate
    if (url.match(/\/admin\/vouchers\/[^/?]+$/) && method === "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }

    // Vouchers list
    if (url.match(/\/admin\/vouchers(\?|$)/) && method === "GET") {
      if (overrides.vouchersError) {
        return route.fulfill({ status: overrides.vouchersError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.vouchers ?? MOCK_VOUCHERS) });
    }

    // Trigger job
    if (url.includes("/admin/operations/trigger-job") && method === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ logId: "log-new", status: "started", jobName: "test" }) });
    }

    // Cron status
    if (url.includes("/admin/operations/cron-status")) {
      if (overrides.cronStatusError) {
        return route.fulfill({ status: overrides.cronStatusError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.cronStatus ?? MOCK_CRON_STATUS) });
    }

    // Job logs
    if (url.includes("/admin/operations/job-logs")) {
      if (overrides.jobLogsError) {
        return route.fulfill({ status: overrides.jobLogsError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.jobLogs ?? MOCK_JOB_LOGS) });
    }

    // Audit logs
    if (url.match(/\/admin\/audit-logs/)) {
      if (overrides.auditLogsError) {
        return route.fulfill({ status: overrides.auditLogsError, contentType: "application/json", body: JSON.stringify({ message: "Error" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides.auditLogs ?? MOCK_AUDIT_LOGS) });
    }

    // Default: empty success
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ─── Bypass Cookie ─────────────────────────────────────────────────────────

export async function setBypassCookie(context: import("@playwright/test").BrowserContext) {
  await context.addCookies([
    { name: "__e2e_bypass", value: "1", domain: "localhost", path: "/" },
  ]);
}
