const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003/api";

let _tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: () => Promise<string | null>) {
  _tokenGetter = getter;
}

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = _tokenGetter ? await _tokenGetter() : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      // If token was null, Clerk may still be initializing — retry once after a short delay
      if (!token && _tokenGetter) {
        await new Promise((r) => setTimeout(r, 1000));
        const retryToken = await _tokenGetter();
        if (retryToken) {
          headers["Authorization"] = `Bearer ${retryToken}`;
          const retry = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
          if (retry.ok) return retry.json();
        }
      }
      window.location.href = "/sign-in";
      throw new Error("Session expired");
    }
    if (response.status === 403) {
      throw new Error("No tienes permisos de administrador. Contacta al equipo de desarrollo.");
    }
    const error = await response.json().catch(() => ({ message: "Network error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Dashboard
export async function getDashboardStats() {
  return fetchAPI("/admin/dashboard/stats");
}

export async function getDashboardActivity() {
  return fetchAPI("/admin/dashboard/activity");
}

// Users
export async function getUsers(params?: { search?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return fetchAPI(`/admin/users${query ? `?${query}` : ""}`);
}

export async function getUser(userId: string) {
  return fetchAPI(`/admin/users/${userId}`);
}

export async function updateUserRole(userId: string, role: string) {
  return fetchAPI(`/admin/users/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function banUser(userId: string, reason: string) {
  return fetchAPI(`/admin/users/${userId}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function unbanUser(userId: string) {
  return fetchAPI(`/admin/users/${userId}/unban`, {
    method: "POST",
  });
}

// Subscriptions
export async function getSubscriptions(params?: { tier?: string; status?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.tier) qs.set("tier", params.tier);
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return fetchAPI(`/admin/subscriptions${query ? `?${query}` : ""}`);
}

export async function overrideTier(userId: string, tier: string) {
  return fetchAPI(`/admin/subscriptions/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ tier }),
  });
}

export async function extendTrial(userId: string, days: number) {
  return fetchAPI(`/admin/subscriptions/${userId}/extend-trial`, {
    method: "POST",
    body: JSON.stringify({ days }),
  });
}

export async function grantComplimentary(userId: string, tier: string, expiresAt?: string) {
  return fetchAPI(`/admin/subscriptions/${userId}/comp`, {
    method: "POST",
    body: JSON.stringify({ tier, expiresAt }),
  });
}

// Vouchers
export async function getVouchers(params?: { active?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.active) qs.set("active", params.active);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return fetchAPI(`/admin/vouchers${query ? `?${query}` : ""}`);
}

export async function getVoucher(id: string) {
  return fetchAPI(`/admin/vouchers/${id}`);
}

export async function createVoucher(data: Record<string, unknown>) {
  return fetchAPI("/admin/vouchers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateVoucher(id: string, data: Record<string, unknown>) {
  return fetchAPI(`/admin/vouchers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deactivateVoucher(id: string) {
  return fetchAPI(`/admin/vouchers/${id}`, {
    method: "DELETE",
  });
}

// Operations
export async function getCronStatus() {
  return fetchAPI("/admin/operations/cron-status");
}

export async function triggerJob(job: string) {
  return fetchAPI("/admin/operations/trigger-job", {
    method: "POST",
    body: JSON.stringify({ job }),
  });
}

export async function getJobLogs(params?: { job?: string; days?: number; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.job) qs.set("job", params.job);
  if (params?.days) qs.set("days", String(params.days));
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return fetchAPI(`/admin/operations/job-logs${query ? `?${query}` : ""}`);
}

// Audit Logs
export async function getAuditLogs(params?: { adminId?: string; targetId?: string; action?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.adminId) qs.set("adminId", params.adminId);
  if (params?.targetId) qs.set("targetId", params.targetId);
  if (params?.action) qs.set("action", params.action);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return fetchAPI(`/admin/audit-logs${query ? `?${query}` : ""}`);
}
