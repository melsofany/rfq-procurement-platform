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
const S = vi.hoisted(() => {
  const S: any = {
    TABLES: {} as Record<string, any>,
    tenantRows: [] as any[],
    ticketRows: [] as any[],
    messageRows: [] as any[],
    inserts: [] as { table: any; rows: any[] }[],
    lastUpdate: null as { table: any; set: any } | null,
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
        S.inserts.push({ table, rows: arr });
        return chain(arr, { returning: () => chain(arr) });
      },
    }),
    update: (table: any) => ({
      set: (vals: any) => {
        S.lastUpdate = { table, set: vals };
        return {
          where: () =>
            chain(S.updateReturning, { returning: () => chain(S.updateReturning) }),
        };
      },
    }),
  };
  return S;
});

S.selectBuilder = function selectBuilder() {
  const api: any = {
    from: vi.fn((table: any) => {
      let rows: any[] = [];
      if (table === S.TABLES.tenantsTable) rows = S.tenantRows;
      else if (table === S.TABLES.supportTicketsTable) rows = S.ticketRows;
      else if (table === S.TABLES.supportTicketMessagesTable) rows = S.messageRows;
      const cur: any = {
        innerJoin: vi.fn(() => cur),
        leftJoin: vi.fn(() => cur),
        where: vi.fn(() => cur),
        orderBy: vi.fn(() => cur),
        groupBy: vi.fn(() => cur),
        limit: vi.fn(() => S.chain(rows)),
        then: (resolve: any) => Promise.resolve(rows).then(resolve),
      };
      return cur;
    }),
  };
  return api;
};

vi.mock("@workspace/db", async () => {
  const actual: any = await vi.importActual("@workspace/db");
  S.TABLES = actual;
  return { ...actual, db: S.dbMock };
});

vi.mock("drizzle-orm", () => {
  const sql: any = (strings: any, ...values: any[]) => ({ strings, values });
  sql.join = (...args: any[]) => args;
  return {
    eq: (a: any) => a,
    and: (...args: any[]) => args.find((a) => a !== undefined) ?? undefined,
    desc: (a: any) => a,
    sql,
  };
});

import supportRouter from "../../modules/support/routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { ...sessionState };
    next();
  });
  app.use(supportRouter);
  return app;
}

const NOW = new Date("2026-08-01T00:00:00Z");

describe("support tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState = { employeeId: 1, role: "superadmin", employeeName: "Root", tenantId: null };
    S.inserts = [];
    S.lastUpdate = null;
    S.updateReturning = [];
    S.tenantRows = [
      { id: 2, name: "شركة ألفا", slug: "alpha", status: "active", createdAt: NOW, updatedAt: NOW },
    ];
    S.ticketRows = [
      {
        id: 50, ticketNo: "TK-2026-000001", tenantId: 2, tenantName: "شركة ألفا",
        subject: "مشكلة في الدخول", category: "technical", priority: "high", status: "open",
        createdById: 5, createdByName: "مدير ألفا", assignedToName: null, resolvedAt: null,
        createdAt: NOW, updatedAt: NOW,
      },
    ];
    S.messageRows = [
      // `cnt` lets the list endpoint's groupBy count query read a count off the row.
      { id: 60, ticketId: 50, senderId: 5, senderName: "مدير ألفا", senderKind: "tenant", body: "لا أستطيع الدخول", createdAt: NOW, cnt: 1 },
    ];
  });

  it("POST /support/tickets creates a ticket with an opening message", async () => {
    sessionState = { employeeId: 5, role: "admin", employeeName: "مدير ألفا", tenantId: 2 };
    const res = await request(buildApp())
      .post("/support/tickets")
      .send({ subject: "مشكلة جديدة", body: "تفاصيل", priority: "urgent", category: "billing" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tenantId: 2, tenantName: "شركة ألفا", status: "open", priority: "urgent" });
    expect(res.body.ticketNo).toMatch(/^TK-\d{4}-\d{6}$/);
    const ticketInsert = S.inserts.find((i: any) => i.table === S.TABLES.supportTicketsTable);
    expect(ticketInsert?.rows[0]).toMatchObject({ tenantId: 2, createdByName: "مدير ألفا" });
    const msgInsert = S.inserts.find((i: any) => i.table === S.TABLES.supportTicketMessagesTable);
    expect(msgInsert?.rows[0]).toMatchObject({ senderKind: "tenant", body: "تفاصيل" });
  });

  it("POST /support/tickets 400s without subject/body and for tenant-less accounts", async () => {
    sessionState = { employeeId: 5, role: "admin", employeeName: "مدير ألفا", tenantId: 2 };
    expect((await request(buildApp()).post("/support/tickets").send({ subject: "x" })).status).toBe(400);
    // Superadmin without impersonation → no tenant.
    sessionState = { employeeId: 1, role: "superadmin", employeeName: "Root", tenantId: null };
    expect((await request(buildApp()).post("/support/tickets").send({ subject: "x", body: "y" })).status).toBe(400);
  });

  it("GET /support/tickets lists the tenant's own tickets only", async () => {
    sessionState = { employeeId: 5, role: "purchasing", employeeName: "موظف", tenantId: 2 };
    const res = await request(buildApp()).get("/support/tickets");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ ticketNo: "TK-2026-000001", messageCount: 1 });
  });

  it("GET /support/tickets/:id 404s for another tenant's ticket", async () => {
    sessionState = { employeeId: 7, role: "admin", employeeName: "مدير بيتا", tenantId: 3 };
    const res = await request(buildApp()).get("/support/tickets/50");
    expect(res.status).toBe(404);
  });

  it("tenant reply on a resolved ticket reopens it", async () => {
    S.ticketRows[0].status = "resolved";
    sessionState = { employeeId: 5, role: "admin", employeeName: "مدير ألفا", tenantId: 2 };
    const res = await request(buildApp()).post("/support/tickets/50/replies").send({ body: "لم تُحل بعد" });
    expect(res.status).toBe(201);
    expect(S.lastUpdate?.set).toEqual({ status: "open", resolvedAt: null });
  });

  it("GET /platform/tickets requires superadmin or support role", async () => {
    sessionState = { employeeId: 5, role: "admin", employeeName: "مدير ألفا", tenantId: 2 };
    expect((await request(buildApp()).get("/platform/tickets")).status).toBe(403);
    sessionState = { employeeId: 9, role: "support", employeeName: "خدمة العملاء", tenantId: null };
    const res = await request(buildApp()).get("/platform/tickets");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("support reply claims the ticket and marks it in_progress", async () => {
    sessionState = { employeeId: 9, role: "support", employeeName: "خدمة العملاء", tenantId: null };
    S.updateReturning = [{ ...S.ticketRows[0], status: "in_progress" }];
    const res = await request(buildApp()).post("/platform/tickets/50/replies").send({ body: "جارٍ المراجعة" });
    expect(res.status).toBe(201);
    const msgInsert = S.inserts.find((i: any) => i.table === S.TABLES.supportTicketMessagesTable);
    expect(msgInsert?.rows[0]).toMatchObject({ senderKind: "support", senderName: "خدمة العملاء" });
    expect(S.lastUpdate?.set).toEqual({ status: "in_progress", assignedToName: "خدمة العملاء" });
  });

  it("PATCH /platform/tickets/:id validates status and stamps resolvedAt", async () => {
    sessionState = { employeeId: 9, role: "support", employeeName: "خدمة العملاء", tenantId: null };
    expect((await request(buildApp()).patch("/platform/tickets/50").send({ status: "bogus" })).status).toBe(400);
    S.updateReturning = [{ ...S.ticketRows[0], status: "resolved", resolvedAt: NOW }];
    const res = await request(buildApp()).patch("/platform/tickets/50").send({ status: "resolved" });
    expect(res.status).toBe(200);
    expect(S.lastUpdate?.set.status).toBe("resolved");
    expect(S.lastUpdate?.set.resolvedAt).toBeInstanceOf(Date);
  });

  it("GET /platform/tickets filters by status and tenant", async () => {
    S.ticketRows.push({
      id: 51, ticketNo: "TK-2026-000002", tenantId: 3, tenantName: "شركة بيتا",
      subject: "سؤال فوترة", category: "billing", priority: "normal", status: "closed",
      createdById: 8, createdByName: "مدير بيتا", assignedToName: null, resolvedAt: null,
      createdAt: NOW, updatedAt: NOW,
    });
    const byStatus = await request(buildApp()).get("/platform/tickets?status=open");
    expect(byStatus.body).toHaveLength(1);
    expect(byStatus.body[0].id).toBe(50);
    const byTenant = await request(buildApp()).get("/platform/tickets?tenantId=3");
    expect(byTenant.body).toHaveLength(1);
    expect(byTenant.body[0].id).toBe(51);
  });
});
