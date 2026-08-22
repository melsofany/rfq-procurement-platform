/**
 * Typed client for the SaaS platform endpoints (/api/platform/*) and the
 * per-tenant settings endpoints (/api/settings/*). These are NOT in the
 * OpenAPI spec, so we use direct fetch (same pattern as receipts/deliveries).
 */

export interface Tenant {
  id: number;
  name: string;
  nameEn?: string | null;
  slug: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: "active" | "suspended" | "pending";
  notes: string | null;
  createdAt: string;
}

export interface SubscriptionPlan {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
  monthlyPrice: string | number | null;
  currency: string | null;
  maxUsers: number | null;
  features: Record<string, boolean> | null;
  isActive: boolean;
}

export interface TenantSubscription {
  id: number;
  tenantId: number;
  planId: number;
  planName?: string | null;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  startsAt: string;
  endsAt: string | null;
  notes: string | null;
  createdByName?: string | null;
}

export interface TenantEmployee {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface TenantWhatsapp {
  configured: boolean;
  enabled: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  displayPhone: string | null;
  accessTokenMasked: string | null;
  updatedByName?: string | null;
  updatedAt?: string;
}

export interface TenantListItem extends Tenant {
  employeeCount: number;
  whatsappConfigured: boolean;
  subscription: TenantSubscription | null;
  plan: SubscriptionPlan | null;
}

export interface TenantDetail extends Tenant {
  subscriptions: TenantSubscription[];
  employees: TenantEmployee[];
  whatsapp: TenantWhatsapp | null;
}

export interface PlatformStats {
  tenants: { total: number; active: number; suspended: number; pending: number };
  subscriptions: { active: number; trial: number };
  recentTenants: Tenant[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* keep status message */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const platformApi = {
  stats: () => api<PlatformStats>("/api/platform/stats"),
  listTenants: () => api<TenantListItem[]>("/api/platform/tenants"),
  getTenant: (id: number) => api<TenantDetail>(`/api/platform/tenants/${id}`),
  createTenant: (body: {
    name: string;
    nameEn?: string | null;
    slug?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    notes?: string | null;
    admin?: { name: string; email: string; password: string } | null;
  }) =>
    api<Tenant & { adminEmployee: { id: number; email: string } | null }>(
      "/api/platform/tenants",
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateTenant: (id: number, body: Partial<Tenant>) =>
    api<Tenant>(`/api/platform/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  createSubscription: (
    tenantId: number,
    body: { planId: number; startsAt?: string; endsAt?: string | null; status?: string; notes?: string | null },
  ) =>
    api<TenantSubscription>(`/api/platform/tenants/${tenantId}/subscriptions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSubscription: (tenantId: number, subId: number, body: { status?: string; endsAt?: string | null; notes?: string | null }) =>
    api<TenantSubscription>(`/api/platform/tenants/${tenantId}/subscriptions/${subId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  resetTenantEmployeePassword: (tenantId: number, employeeId: number, newPassword: string) =>
    api<{ ok: boolean; email: string }>(
      `/api/platform/tenants/${tenantId}/employees/${employeeId}/password`,
      { method: "POST", body: JSON.stringify({ newPassword }) },
    ),
  listPlans: () => api<SubscriptionPlan[]>("/api/platform/plans"),
  createPlan: (body: Partial<SubscriptionPlan> & { code: string; nameAr: string }) =>
    api<SubscriptionPlan>("/api/platform/plans", { method: "POST", body: JSON.stringify(body) }),
  updatePlan: (id: number, body: Partial<SubscriptionPlan>) =>
    api<SubscriptionPlan>(`/api/platform/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};

export interface CompanySettings {
  tenant: {
    id: number;
    name: string;
    nameEn: string | null;
    slug: string;
    contactEmail: string | null;
    contactPhone: string | null;
    status: "active" | "suspended" | "pending";
    notes: string | null;
  };
  subscription: {
    id: number;
    status: "trialing" | "active" | "past_due" | "canceled" | "expired";
    startsAt: string;
    endsAt: string | null;
    plan: {
      nameAr: string;
      nameEn: string | null;
      monthlyPrice: string | number | null;
      currency: string | null;
      maxUsers: number | null;
    } | null;
  } | null;
  whatsappConfigured: boolean;
}

export const settingsApi = {
  getWhatsapp: () => api<TenantWhatsapp>("/api/settings/whatsapp"),
  saveWhatsapp: (body: {
    phoneNumberId?: string | null;
    wabaId?: string | null;
    displayPhone?: string | null;
    accessToken?: string | null;
    enabled?: boolean;
  }) =>
    api<TenantWhatsapp & { ok: boolean }>("/api/settings/whatsapp", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getCompany: () => api<CompanySettings>("/api/settings/company"),
  updateCompany: (body: { contactEmail?: string | null; contactPhone?: string | null; notes?: string | null }) =>
    api<{ ok: boolean }>("/api/settings/company", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
