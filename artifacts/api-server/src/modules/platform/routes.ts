import { Router, type Request } from "express";
import bcrypt from "bcrypt";
import {
  db,
  tenantsTable,
  subscriptionPlansTable,
  tenantSubscriptionsTable,
  tenantWhatsappSettingsTable,
  employeesTable,
  auditLogTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../middlewares/auth";

/**
 * SaaS platform administration. Superadmin-only: manage companies (tenants),
 * subscription plans, and per-tenant WhatsApp Cloud API credentials.
 */
const router = Router();

// All routes below are platform-level.
router.use(requireRole("superadmin"));

function audit(req: Request, action: string, entityId: number | null, description: string): void {
  void db
    .insert(auditLogTable)
    .values({
      action,
      entityType: "platform",
      entityId,
      employeeId: req.session.employeeId ?? null,
      description,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      tenantId: null,
    })
    .then(() => {}, () => {});
}

function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "tenant";
}

function maskSecret(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function parseId(req: Request): number {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return parseInt(raw, 10);
}

interface AdminInput {
  name?: string;
  email?: string;
  password?: string;
}

interface TenantBody {
  name?: string;
  slug?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  status?: string;
  admin?: AdminInput;
}

type TenantRow = typeof tenantsTable.$inferSelect;
type PlanRow = typeof subscriptionPlansTable.$inferSelect;
type SubscriptionRow = typeof tenantSubscriptionsTable.$inferSelect;

function serializeTenant(t: TenantRow) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    status: t.status,
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
  };
}

function serializePlan(p: PlanRow) {
  return {
    id: p.id,
    code: p.code,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    description: p.description,
    monthlyPrice: p.monthlyPrice,
    currency: p.currency,
    maxUsers: p.maxUsers,
    features: p.features ?? null,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

function serializeSubscription(s: SubscriptionRow) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    planId: s.planId,
    status: s.status,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    notes: s.notes,
    createdByName: s.createdByName,
    createdAt: s.createdAt.toISOString(),
  };
}

// ─── Plans ─────────────────────────────────────────────────────────────────
router.get("/platform/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(subscriptionPlansTable).orderBy(subscriptionPlansTable.id);
  res.json(plans.map(serializePlan));
});

router.post("/platform/plans", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
  if (!code || !nameAr) {
    res.status(400).json({ error: "code and nameAr are required" });
    return;
  }
  const [plan] = await db
    .insert(subscriptionPlansTable)
    .values({
      code,
      nameAr,
      nameEn: typeof body.nameEn === "string" ? body.nameEn : null,
      description: typeof body.description === "string" ? body.description : null,
      monthlyPrice: body.monthlyPrice != null ? String(body.monthlyPrice) : "0",
      currency: typeof body.currency === "string" ? body.currency : "EGP",
      maxUsers: typeof body.maxUsers === "number" ? body.maxUsers : null,
      features: (body.features as Record<string, boolean>) ?? null,
    })
    .returning();
  audit(req, "platform.plan.created", plan.id, `Plan ${plan.code} (${plan.nameAr}) created`);
  res.status(201).json(serializePlan(plan));
});

router.patch("/platform/plans/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (body.nameAr !== undefined) updates.nameAr = body.nameAr;
  if (body.nameEn !== undefined) updates.nameEn = body.nameEn;
  if (body.description !== undefined) updates.description = body.description;
  if (body.monthlyPrice !== undefined) updates.monthlyPrice = String(body.monthlyPrice);
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.maxUsers !== undefined) updates.maxUsers = body.maxUsers;
  if (body.features !== undefined) updates.features = body.features;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  const [plan] = await db
    .update(subscriptionPlansTable)
    .set(updates)
    .where(eq(subscriptionPlansTable.id, id))
    .returning();
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  audit(req, "platform.plan.updated", plan.id, `Plan ${plan.code} updated`);
  res.json(serializePlan(plan));
});

// ─── Tenants ───────────────────────────────────────────────────────────────
router.get("/platform/tenants", async (_req, res): Promise<void> => {
  const [tenants, plans, subs, employees, waSettings] = await Promise.all([
    db.select().from(tenantsTable).orderBy(tenantsTable.id),
    db.select().from(subscriptionPlansTable),
    db.select().from(tenantSubscriptionsTable).orderBy(desc(tenantSubscriptionsTable.id)),
    db.select({ id: employeesTable.id, tenantId: employeesTable.tenantId }).from(employeesTable),
    db
      .select({
        tenantId: tenantWhatsappSettingsTable.tenantId,
        enabled: tenantWhatsappSettingsTable.enabled,
      })
      .from(tenantWhatsappSettingsTable),
  ]);
  const planById = new Map(plans.map((p) => [p.id, p]));
  const latestSub = new Map<number, SubscriptionRow>();
  for (const s of subs) {
    if (!latestSub.has(s.tenantId) && (s.status === "active" || s.status === "trialing")) {
      latestSub.set(s.tenantId, s);
    }
  }
  const empCount = new Map<number, number>();
  for (const e of employees) {
    if (e.tenantId != null) empCount.set(e.tenantId, (empCount.get(e.tenantId) ?? 0) + 1);
  }
  const waConfigured = new Set(waSettings.filter((w) => w.enabled).map((w) => w.tenantId));
  res.json(
    tenants.map((t) => {
      const sub = latestSub.get(t.id) ?? null;
      const plan = sub ? planById.get(sub.planId) ?? null : null;
      return {
        ...serializeTenant(t),
        employeeCount: empCount.get(t.id) ?? 0,
        whatsappConfigured: waConfigured.has(t.id),
        subscription: sub ? serializeSubscription(sub) : null,
        plan: plan ? serializePlan(plan) : null,
      };
    }),
  );
});

router.post("/platform/tenants", async (req, res): Promise<void> => {
  const body = req.body as TenantBody;
  const name = (body.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const slug = (body.slug?.trim() || slugify(name)) as string;
  const [conflict] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug))
    .limit(1);
  if (conflict) {
    res.status(409).json({ error: "Slug already in use — pick a different one" });
    return;
  }
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      name,
      slug,
      contactEmail: body.contactEmail ?? null,
      contactPhone: body.contactPhone ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  let adminEmployee: { id: number; email: string } | null = null;
  const admin = body.admin;
  if (admin && admin.name && admin.email && admin.password) {
    const [existing] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.email, admin.email.toLowerCase()))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "admin email already in use — tenant created without admin user" });
      return;
    }
    const hash = await bcrypt.hash(admin.password, 10);
    const [emp] = await db
      .insert(employeesTable)
      .values({
        name: admin.name,
        email: admin.email.toLowerCase(),
        passwordHash: hash,
        role: "admin",
        tenantId: tenant.id,
      })
      .returning({ id: employeesTable.id, email: employeesTable.email });
    adminEmployee = emp;
  }
  audit(req, "platform.tenant.created", tenant.id, `Tenant ${name} (${slug}) created`);
  res.status(201).json({ ...serializeTenant(tenant), adminEmployee });
});

router.get("/platform/tenants/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const [subs, plans, employees, wa] = await Promise.all([
    db
      .select()
      .from(tenantSubscriptionsTable)
      .where(eq(tenantSubscriptionsTable.tenantId, id))
      .orderBy(desc(tenantSubscriptionsTable.id)),
    db.select().from(subscriptionPlansTable),
    db
      .select({
        id: employeesTable.id,
        name: employeesTable.name,
        email: employeesTable.email,
        role: employeesTable.role,
        isActive: employeesTable.isActive,
      })
      .from(employeesTable)
      .where(eq(employeesTable.tenantId, id)),
    db
      .select()
      .from(tenantWhatsappSettingsTable)
      .where(eq(tenantWhatsappSettingsTable.tenantId, id))
      .limit(1),
  ]);
  const planById = new Map(plans.map((p) => [p.id, p]));
  const waRow = wa[0] ?? null;
  res.json({
    ...serializeTenant(tenant),
    subscriptions: subs.map((s) => ({
      ...serializeSubscription(s),
      planName: planById.get(s.planId)?.nameAr ?? null,
    })),
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      role: e.role,
      isActive: e.isActive,
    })),
    whatsapp: waRow
      ? {
          phoneNumberId: waRow.phoneNumberId,
          wabaId: waRow.wabaId,
          displayPhone: waRow.displayPhone,
          enabled: waRow.enabled,
          accessTokenMasked: maskSecret(waRow.accessToken),
          updatedByName: waRow.updatedByName,
          updatedAt: waRow.updatedAt.toISOString(),
        }
      : null,
  });
});

router.patch("/platform/tenants/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  const body = req.body as TenantBody;
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.contactEmail !== undefined) updates.contactEmail = body.contactEmail;
  if (body.contactPhone !== undefined) updates.contactPhone = body.contactPhone;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.status !== undefined) {
    if (!["active", "suspended", "pending"].includes(String(body.status))) {
      res.status(400).json({ error: "status must be active|suspended|pending" });
      return;
    }
    updates.status = body.status;
  }
  const [tenant] = await db
    .update(tenantsTable)
    .set(updates)
    .where(eq(tenantsTable.id, id))
    .returning();
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  audit(req, "platform.tenant.updated", tenant.id, `Tenant ${tenant.name} updated`);
  res.json(serializeTenant(tenant));
});

// ─── Subscriptions ─────────────────────────────────────────────────────────
router.post("/platform/tenants/:id/subscriptions", async (req, res): Promise<void> => {
  const id = parseId(req);
  const body = req.body as Record<string, unknown>;
  const planId = Number(body.planId);
  const startsAt =
    typeof body.startsAt === "string" && body.startsAt ? body.startsAt : new Date().toISOString().slice(0, 10);
  const endsAt = body.endsAt != null ? String(body.endsAt) : null;
  const status = typeof body.status === "string" && body.status ? body.status : "active";
  if (!Number.isFinite(planId)) {
    res.status(400).json({ error: "planId is required" });
    return;
  }
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id))
    .limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, planId))
    .limit(1);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  // Expire older active/trialing subs so the newest one is authoritative.
  const active = await db
    .select({ id: tenantSubscriptionsTable.id })
    .from(tenantSubscriptionsTable)
    .where(
      and(
        eq(tenantSubscriptionsTable.tenantId, id),
        inArray(tenantSubscriptionsTable.status, ["active", "trialing"]),
      ),
    );
  if (active.length) {
    await db
      .update(tenantSubscriptionsTable)
      .set({ status: "canceled" })
      .where(inArray(tenantSubscriptionsTable.id, active.map((a) => a.id)));
  }
  const [sub] = await db
    .insert(tenantSubscriptionsTable)
    .values({
      tenantId: id,
      planId,
      status: status as SubscriptionRow["status"],
      startsAt,
      endsAt,
      notes: typeof body.notes === "string" ? body.notes : null,
      createdByName: req.session.employeeName ?? null,
    })
    .returning();
  audit(req, "platform.subscription.created", sub.id, `Tenant ${id} subscribed to plan ${plan.code}`);
  res.status(201).json(serializeSubscription(sub));
});

// ─── Per-tenant WhatsApp credentials ───────────────────────────────────────
router.get("/platform/tenants/:id/whatsapp", async (req, res): Promise<void> => {
  const id = parseId(req);
  const [row] = await db
    .select()
    .from(tenantWhatsappSettingsTable)
    .where(eq(tenantWhatsappSettingsTable.tenantId, id))
    .limit(1);
  if (!row) {
    res.json({
      configured: false,
      enabled: false,
      phoneNumberId: null,
      wabaId: null,
      displayPhone: null,
      accessTokenMasked: null,
    });
    return;
  }
  res.json({
    configured: true,
    enabled: row.enabled,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    displayPhone: row.displayPhone,
    accessTokenMasked: maskSecret(row.accessToken),
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.put("/platform/tenants/:id/whatsapp", async (req, res): Promise<void> => {
  const id = parseId(req);
  const body = req.body as Record<string, unknown>;
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id))
    .limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : null;
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : null;
  const wabaId = typeof body.wabaId === "string" ? body.wabaId.trim() : null;
  const displayPhone = typeof body.displayPhone === "string" ? body.displayPhone.trim() : null;
  const enabled = body.enabled === undefined ? Boolean(phoneNumberId && accessToken) : Boolean(body.enabled);
  const [row] = await db
    .insert(tenantWhatsappSettingsTable)
    .values({
      tenantId: id,
      phoneNumberId,
      accessToken,
      wabaId,
      displayPhone,
      enabled,
      updatedByName: req.session.employeeName ?? null,
    })
    .onConflictDoUpdate({
      target: tenantWhatsappSettingsTable.tenantId,
      set: {
        phoneNumberId,
        accessToken,
        wabaId,
        displayPhone,
        enabled,
        updatedByName: req.session.employeeName ?? null,
      },
    })
    .returning();
  audit(req, "platform.whatsapp.updated", id, `WhatsApp config for tenant ${id} updated`);
  res.json({
    configured: true,
    enabled: row.enabled,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    displayPhone: row.displayPhone,
    accessTokenMasked: maskSecret(row.accessToken),
  });
});

router.delete("/platform/tenants/:id/whatsapp", async (req, res): Promise<void> => {
  const id = parseId(req);
  const [row] = await db
    .delete(tenantWhatsappSettingsTable)
    .where(eq(tenantWhatsappSettingsTable.tenantId, id))
    .returning({ tenantId: tenantWhatsappSettingsTable.tenantId });
  if (!row) {
    res.status(404).json({ error: "No WhatsApp config for this tenant" });
    return;
  }
  audit(req, "platform.whatsapp.deleted", id, `WhatsApp config for tenant ${id} removed — env fallback`);
  res.json({ ok: true });
});

export default router;
