/** Support tickets API — not in the OpenAPI spec, so direct fetch (same pattern
 * as receipts/deliveries/accounts). Company side: /api/support/*.
 * Platform side (superadmin + support role): /api/platform/tickets/*. */

export interface TicketMessage {
  id: number;
  senderName: string | null;
  senderKind: "tenant" | "support";
  body: string;
  createdAt: string;
}

export interface Ticket {
  id: number;
  ticketNo: string;
  tenantId: number;
  tenantName: string | null;
  subject: string;
  category: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdByName: string | null;
  assignedToName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
  return data as T;
}

export const TICKET_CATEGORIES = [
  { value: "technical", ar: "مشكلة تقنية" },
  { value: "billing", ar: "الاشتراك والفوترة" },
  { value: "whatsapp", ar: "تكامل واتساب" },
  { value: "data", ar: "البيانات" },
  { value: "feature", ar: "طلب ميزة" },
  { value: "other", ar: "أخرى" },
] as const;

// ─── Company side ─────────────────────────────────────────────────────────
export const supportApi = {
  list: () => api<Ticket[]>("/api/support/tickets"),
  get: (id: number) => api<TicketDetail>(`/api/support/tickets/${id}`),
  create: (input: { subject: string; body: string; category?: string; priority?: string }) =>
    api<Ticket>("/api/support/tickets", { method: "POST", body: JSON.stringify(input) }),
  reply: (id: number, body: string) =>
    api<{ ok: boolean }>(`/api/support/tickets/${id}/replies`, { method: "POST", body: JSON.stringify({ body }) }),
};

// ─── Platform side ────────────────────────────────────────────────────────
export const ticketsAdminApi = {
  list: (filters?: { status?: string; tenantId?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.tenantId) params.set("tenantId", String(filters.tenantId));
    const qs = params.toString();
    return api<Ticket[]>(`/api/platform/tickets${qs ? `?${qs}` : ""}`);
  },
  get: (id: number) => api<TicketDetail>(`/api/platform/tickets/${id}`),
  reply: (id: number, body: string) =>
    api<{ ok: boolean; status: string }>(`/api/platform/tickets/${id}/replies`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  update: (id: number, updates: { status?: string; priority?: string; assignedToName?: string | null }) =>
    api<Ticket>(`/api/platform/tickets/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
};
