import { test, expect } from "@playwright/test";
import { API_BASE, e2eToken } from "./helpers";

test.describe("Admin API — Auth Guards", () => {
  const clerkId = `e2e_admin_api_${Date.now()}`;
  const validToken = e2eToken(clerkId);
  const validHeaders = { Authorization: `Bearer ${validToken}` };

  // ─── No Auth ─────────────────────────────────────────────────────────────

  test("GET /admin/dashboard/stats without auth header returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/admin/dashboard/stats`);
    expect(res.status()).toBe(401);
  });

  test("GET /admin/dashboard/stats with invalid token returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/admin/dashboard/stats`, {
      headers: { Authorization: "Bearer totally-invalid-token" },
    });
    expect(res.status()).toBe(401);
  });

  // ─── 401 Response Shape ──────────────────────────────────────────────────

  test("401 response has proper error format", async ({ request }) => {
    const res = await request.get(`${API_BASE}/admin/dashboard/stats`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("statusCode", 401);
    expect(body).toHaveProperty("message");
    expect(typeof body.message).toBe("string");
  });

  // ─── Non-Admin User → 403 ───────────────────────────────────────────────

  test("non-admin user gets 403 on GET /admin/dashboard/stats", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/admin/dashboard/stats`, {
      headers: validHeaders,
    });
    expect(res.status()).toBe(403);
  });

  test("non-admin user gets 403 on GET /admin/users", async ({ request }) => {
    const res = await request.get(`${API_BASE}/admin/users`, {
      headers: validHeaders,
    });
    expect(res.status()).toBe(403);
  });

  test("non-admin user gets 403 on POST /admin/operations/trigger-job", async ({
    request,
  }) => {
    const res = await request.post(
      `${API_BASE}/admin/operations/trigger-job`,
      {
        headers: validHeaders,
        data: { jobName: "price-ingestion" },
      },
    );
    expect(res.status()).toBe(403);
  });

  // ─── 403 Response Shape ──────────────────────────────────────────────────

  test("403 response has { statusCode: 403, message: string } shape", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/admin/dashboard/stats`, {
      headers: validHeaders,
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("statusCode", 403);
    expect(body).toHaveProperty("message");
    expect(typeof body.message).toBe("string");
  });

  // ─── 403 Across All Admin Endpoints ──────────────────────────────────────

  test("non-admin gets 403 on GET /admin/users with query params", async ({
    request,
  }) => {
    const res = await request.get(
      `${API_BASE}/admin/users?search=test&page=2&limit=10`,
      { headers: validHeaders },
    );
    expect(res.status()).toBe(403);
  });

  test("non-admin gets 403 on PUT /admin/users/:id/role", async ({
    request,
  }) => {
    const res = await request.put(
      `${API_BASE}/admin/users/some-user-id/role`,
      {
        headers: validHeaders,
        data: { role: "admin" },
      },
    );
    expect(res.status()).toBe(403);
  });

  test("non-admin gets 403 on POST /admin/users/:id/ban", async ({
    request,
  }) => {
    const res = await request.post(
      `${API_BASE}/admin/users/some-user-id/ban`,
      {
        headers: validHeaders,
        data: { reason: "test" },
      },
    );
    expect(res.status()).toBe(403);
  });

  test("non-admin gets 403 on POST /admin/vouchers with empty body", async ({
    request,
  }) => {
    const res = await request.post(`${API_BASE}/admin/vouchers`, {
      headers: validHeaders,
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  test("non-admin gets 403 on POST /admin/operations/trigger-job with invalid job name", async ({
    request,
  }) => {
    const res = await request.post(
      `${API_BASE}/admin/operations/trigger-job`,
      {
        headers: validHeaders,
        data: { jobName: "nonexistent-job" },
      },
    );
    // Guard runs before validation, so we still get 403
    expect(res.status()).toBe(403);
  });

  // ─── Consistency: all 403s are uniform ───────────────────────────────────

  test("403 responses are consistent across different admin endpoints", async ({
    request,
  }) => {
    const endpoints = [
      { method: "GET", url: `${API_BASE}/admin/dashboard/stats` },
      { method: "GET", url: `${API_BASE}/admin/users` },
      { method: "GET", url: `${API_BASE}/admin/subscriptions` },
      { method: "GET", url: `${API_BASE}/admin/vouchers` },
      { method: "GET", url: `${API_BASE}/admin/operations/cron-status` },
      { method: "GET", url: `${API_BASE}/admin/audit-logs` },
    ];

    const responses = await Promise.all(
      endpoints.map(({ method, url }) => {
        if (method === "GET") {
          return request.get(url, { headers: validHeaders });
        }
        return request.post(url, { headers: validHeaders, data: {} });
      }),
    );

    for (const res of responses) {
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body).toHaveProperty("statusCode", 403);
      expect(body).toHaveProperty("message");
    }
  });
});
