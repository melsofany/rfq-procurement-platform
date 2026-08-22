import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock auth (requireRole must also stamp req.session for scope helpers) ──
let sessionState: any = { employeeId: 1, role: "superadmin", employeeName: "Root", tenantId: null };
vi.mock("../../middlewares/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.session = { ...req.session, ...sessionState };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!sessionState.employeeId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(sessionState.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    req.session = { ...req.session, ...sessionState };
    next();
  },
}));

// ── Chainable + thenable DB mock ────────────────────────────────────────────
function chainable(value: any, methods: Record<string, any> = {}): any {
  const obj: any = { then: (resolve: any) => Promise.resolve(value).then(resolve) };
  for (const [k, fn] of Object.entries(methods)) obj[k] = fn;
  return obj;
}

const S = vi.hoisted(() => {
  const S: any = {
    TABLES: {} as Record<string, any>,
    tenantRows: [] as any[],
    planRows: [] as any[],
    subRows: [] as any[],
    employeeRows: [] as any[],
    waRows: [] as any[],
    lastInsert: null as { table: any; rows: any[] } | null,
    inserts: [] as { table: any; rows: any[] }[],
    lastUpdate: null as { table: any; set: any; returning: any[] } | null,
    updateReturning: [] as any[],
  };
  const chain = (value: any, methods: Record<string, any> = {}): any => {
    const obj: any = { then: (resolve: any) => Promise.resolve(value).then(resolve) };
    for (const [k, fn] of Object.entries(methods)) obj[k] = fn;
    return obj;
  };
  S.chain = chain;
  S.dbMock = {
    select: (..._args: any[]) => S.selectBuilder(),
    insert: (table: any) => ({
      values: (rows: any) => {
        const arr = (Array.isArray(rows) ? rows : [rows]).map((r: any, i: number) => ({
          id: 900 + i,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          ...r,
        }));
        S.lastInsert = { table, rows: arr };
        S.inserts.push({ table, rows: arr });
        return chain(arr, {
          returning: () => chain(arr),
          onConflictDoUpdate: () => ({ returning: () => chain(arr) }),
        });
      },
    }),
    update: (table: any) => ({
      set: (vals: any) => ({
        where: () =>
          chain(S.updateReturning, {
            returning: () => {
              S.lastUpdate = { table, set: vals, returning: S.updateReturning };
              return chain(S.updateReturning);
            },
          }),
      }),
    }),
    delete: () => ({ where: () => chain([], { returning: () => chain([]) }) }),
  };
  return S;
});

S.selectBuilder = function selectBuilder() {
  const api: any = {
    from: vi.fn((table: any) => {
      let rows: any[] = [];
      if (table === S.TABLES.tenantsTable) rows = S.tenantRows;
      else if (table === S.TABLES.subscriptionPlansTable) rows = S.planRows;
      else if (table === S.TABLES.tenantSubscriptionsTable) rows = S.subRows;
      else if (table === S.TABLES.employeesTable) rows = S.employeeRows;
      else if (table === S.TABLES.tenantWhatsappSettingsTable) rows = S.waRows;
      else if (table === S.TABLES.auditLogTable) rows = [];
      const cur: any = {
        innerJoin: vi.fn(() => cur),
        leftJoin: vi.fn(() => cur),
        where: vi.fn(() => cur),
        orderBy: vi.fn(() => cur),
        limit: vi.fn(() => S.chain(rows)),
        then: (resolve: any) => Promise.resolve(rows).then(resolve),
      };
      return cur;
    }),
  };
  return api;
}

vi.mock("@workspace/db", async () => {
  const actual: any = await vi.importActual("@workspace/db");
  S.TABLES = actual;
  return { ...actual, db: S.dbMock };
});

vi.mock("drizzle-orm", () => ({
  eq: (a: any) => a,
  and: (...args: any[]) => args.find((a) => a !== undefined) ?? undefined,
  desc: (a: any) => a,
  inArray: (a: any) => a,
}));

import platformRouter from "../../modules/platform/routes";
import settingsRouter from "../../modules/settings/routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  app.use(platformRouter);
  app.use(settingsRouter);
  return app;
}

const NOW = new Date("2026-08-01T00:00:00Z");

describe("platform SaaS routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState = { employeeId: 1, role: "superadmin", employeeName: "Root", tenantId: null };
    S.lastInsert = null;
    S.inserts = [];
    S.lastUpdate = null;
    S.updateReturning = [];
    S.tenantRows = [
      { id: 1, name: "المنصة", nameEn: null, slug: "default", contactEmail: null, contactPhone: null, status: "active", notes: null, createdAt: NOW, updatedAt: NOW },
      { id: 2, name: "شركة ألفا", nameEn: "Alpha", slug: "alpha", contactEmail: null, contactPhone: null, status: "suspended", notes: null, createdAt: new Date("2026-07-01"), updatedAt: NOW },
      { id: 3, name: "شركة بيتا", nameEn: null, slug: "beta", contactEmail: null, contactPhone: null, status: "pending", notes: null, createdAt: new Date("2026-06-01"), updatedAt: NOW },
    ];
    S.planRows = [{ id: 10, code: "starter", nameAr: "الباقة الأساسية", nameEn: "Starter", description: null, monthlyPrice: "500", currency: "EGP", maxUsers: 5, features: null, isActive: true, createdAt: NOW }];
    S.subRows = [
      { id: 20, tenantId: 2, planId: 10, status: "active", startsAt: "2026-08-01", endsAt: null, notes: null, createdByName: null, createdAt: NOW },
      { id: 21, tenantId: 3, planId: 10, status: "trialing", startsAt: "2026-07-01", endsAt: null, notes: null, createdByName: null, createdAt: NOW },
    ];
    S.employeeRows = [{ id: 5, name: "مدير ألفا", email: "alpha@example.com", role: "admin", isActive: true, tenantId: 2 }];
    S.waRows = [];
  });

  it("GET /platform/stats aggregates tenant + subscription counts", async () => {
    const res = await request(buildApp()).get("/platform/stats");
    expect(res.status).toBe(200);
    expect(res.body.tenants).toEqual({ total: 3, active: 1, suspended: 1, pending: 1 });
    expect(res.body.subscriptions).toEqual({ active: 1, trial: 1 });
    expect(res.body.recentTenants[0].slug).toBe("default");
  });

  it("GET /platform/stats rejects non-superadmin", async () => {
    sessionState.role = "admin";
    const res = await request(buildApp()).get("/platform/stats");
    expect(res.status).toBe(403);
  });

  it("PATCH subscription updates status + endsAt", async () => {
    S.updateReturning = [
      { id: 20, tenantId: 2, planId: 10, status: "canceled", startsAt: "2026-08-01", endsAt: "2026-09-01", notes: null, createdByName: null, createdAt: NOW },
    ];
    const res = await request(buildApp())
      .patch("/platform/tenants/2/subscriptions/20")
      .send({ status: "canceled", endsAt: "2026-09-01" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("canceled");
    expect(S.lastUpdate?.set).toEqual({ status: "canceled", endsAt: "2026-09-01" });
  });

  it("PATCH subscription 400s on bad status / empty body, 404s when missing", async () => {
    const app = buildApp();
    expect((await request(app).patch("/platform/tenants/2/subscriptions/20").send({ status: "weird" })).status).toBe(400);
    expect((await request(app).patch("/platform/tenants/2/subscriptions/20").send({})).status).toBe(400);
    S.updateReturning = [];
    expect((await request(app).patch("/platform/tenants/2/subscriptions/999").send({ status: "active" })).status).toBe(404);
  });

  it("POST employee password reset validates length and updates", async () => {
    const app = buildApp();
    expect(
      (await request(app).post("/platform/tenants/2/employees/5/password").send({ newPassword: "short" })).status,
    ).toBe(400);
    S.updateReturning = [{ id: 5, email: "alpha@example.com" }];
    const res = await request(app)
      .post("/platform/tenants/2/employees/5/password")
      .send({ newPassword: "new-secret-123" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, email: "alpha@example.com" });
    S.updateReturning = [];
    expect(
      (await request(app).post("/platform/tenants/2/employees/999/password").send({ newPassword: "new-secret-123" })).status,
    ).toBe(404);
  });

  it("GET /settings/whatsapp returns unconfigured when tenant has no row", async () => {
    sessionState = { employeeId: 5, role: "admin", employeeName: "مدير ألفا", tenantId: 2 };
    const res = await request(buildApp()).get("/settings/whatsapp");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: false, enabled: false, phoneNumberId: null });
  });

  it("GET /settings/whatsapp masks the stored access token", async () => {
    sessionState = { employeeId: 5, role: "admin", employeeName: "مدير ألفا", tenantId: 2 };
    S.waRows = [
      { id: 30, tenantId: 2, phoneNumberId: "12345", accessToken: "EAA_SUPER_SECRET_TOKEN", wabaId: "999", displayPhone: "+2010", enabled: true, updatedByName: null, createdAt: NOW, updatedAt: NOW },
    ];
    const res = await request(buildApp()).get("/settings/whatsapp");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: true, enabled: true, phoneNumberId: "12345", wabaId: "999" });
    expect(res.body.accessTokenMasked).toContain("…");
    expect(JSON.stringify(res.body)).not.toContain("EAA_SUPER_SECRET_TOKEN");
  });

  it("PUT /settings/whatsapp upserts the tenant row", async () => {
    sessionState = { employeeId: 5, role: "admin", employeeName: "مدير ألفا", tenantId: 2 };
    const res = await request(buildApp())
      .put("/settings/whatsapp")
      .send({ phoneNumberId: "12345", accessToken: "tok", wabaId: "999", enabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, configured: true, enabled: true, phoneNumberId: "12345" });
    const waInsert = S.inserts.find((i: any) => i.table === S.TABLES.tenantWhatsappSettingsTable);
    expect(waInsert).toBeDefined();
    expect(waInsert?.rows[0]).toMatchObject({ tenantId: 2, phoneNumberId: "12345", accessToken: "tok", enabled: true });
  });

  it("PUT /settings/whatsapp 400s when the account has no tenant", async () => {
    // Superadmin without impersonation header → no effective tenant.
    const res = await request(buildApp()).put("/settings/whatsapp").send({ phoneNumberId: "1" });
    expect(res.status).toBe(400);
  });
});
