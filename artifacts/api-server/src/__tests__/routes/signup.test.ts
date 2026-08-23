import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed") },
  hash: vi.fn().mockResolvedValue("hashed"),
}));

function chainable(value: any, methods: Record<string, any> = {}): any {
  const obj: any = { then: (resolve: any) => Promise.resolve(value).then(resolve) };
  for (const [k, fn] of Object.entries(methods)) obj[k] = fn;
  return obj;
}

const S = vi.hoisted(() => {
  const S: any = {
    employeesTable: { _: "employees" },
    tenantsTable: { _: "tenants" },
    auditLogTable: { _: "audit" },
    existingEmployee: [] as any[],
    slugRows: [] as any[],
    tenantInsert: null as any,
    employeeInsert: null as any,
    auditInserts: [] as any[],
  };
  S.dbMock = {
    select: (arg: any) => ({
      from: (table: any) => {
        if (table === S.employeesTable) {
          return {
            where: () => ({ limit: () => chainable(S.existingEmployee) }),
          };
        }
        if (table === S.tenantsTable) {
          return { where: () => chainable(S.slugRows) };
        }
        return chainable([]);
      },
    }),
    insert: (table: any) => ({
      values: (vals: any) => {
        if (table === S.tenantsTable) {
          S.tenantInsert = vals;
          const row = { id: 42, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), ...vals };
          return chainable([row], { returning: () => chainable([row]) });
        }
        if (table === S.employeesTable) {
          S.employeeInsert = vals;
          return chainable([vals]);
        }
        S.auditInserts.push({ table, vals });
        return chainable(undefined);
      },
    }),
  };
  return S;
});

vi.mock("@workspace/db", () => ({
  db: S.dbMock,
  employeesTable: S.employeesTable,
  tenantsTable: S.tenantsTable,
  auditLogTable: S.auditLogTable,
}));

import signupRouter from "../../modules/signup/routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = {};
    next();
  });
  app.use("/api", signupRouter);
  return app;
}

describe("POST /api/signup", () => {
  beforeEach(() => {
    S.existingEmployee = [];
    S.slugRows = [];
    S.tenantInsert = null;
    S.employeeInsert = null;
    S.auditInserts = [];
  });

  it("creates a pending tenant + admin employee", async () => {
    const res = await request(buildApp()).post("/api/signup").send({
      companyName: "شركة النور للتوريدات",
      name: "Ahmed",
      email: "ahmed@nour.com",
      password: "secret123",
      phone: "01001234567",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(S.tenantInsert).toMatchObject({
      name: "شركة النور للتوريدات",
      status: "pending",
      contactEmail: "ahmed@nour.com",
      contactPhone: "01001234567",
    });
    expect(S.tenantInsert.slug).toBeTruthy();
    expect(S.employeeInsert).toMatchObject({
      name: "Ahmed",
      email: "ahmed@nour.com",
      role: "admin",
      tenantId: 42,
      passwordHash: "hashed",
    });
    expect(S.auditInserts.some((a) => a.table === S.auditLogTable && a.vals.action === "signup.submitted")).toBe(true);
  });

  it("suffixes the slug on collision", async () => {
    S.slugRows = [{ slug: "acme" }, { slug: "acme-2" }];
    const res = await request(buildApp()).post("/api/signup").send({
      companyName: "Acme",
      name: "A",
      email: "a@acme.com",
      password: "secret123",
    });
    expect(res.status).toBe(201);
    expect(S.tenantInsert.slug).toBe("acme-3");
  });

  it("rejects duplicate admin email with 409", async () => {
    S.existingEmployee = [{ id: 7 }];
    const res = await request(buildApp()).post("/api/signup").send({
      companyName: "X",
      name: "A",
      email: "a@x.com",
      password: "secret123",
    });
    expect(res.status).toBe(409);
    expect(S.tenantInsert).toBeNull();
  });

  it("validates required fields", async () => {
    const res = await request(buildApp()).post("/api/signup").send({ companyName: "X" });
    expect(res.status).toBe(400);
  });

  it("rejects short passwords", async () => {
    const res = await request(buildApp()).post("/api/signup").send({
      companyName: "X",
      name: "A",
      email: "a@x.com",
      password: "short",
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    const res = await request(buildApp()).post("/api/signup").send({
      companyName: "X",
      name: "A",
      email: "not-an-email",
      password: "secret123",
    });
    expect(res.status).toBe(400);
  });
});
