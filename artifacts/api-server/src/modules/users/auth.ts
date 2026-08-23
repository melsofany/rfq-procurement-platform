import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { db, employeesTable, auditLogTable, tenantsTable } from "@workspace/db";
import { eq, and, type SQL } from "drizzle-orm";
import { logger } from "../../shared/logger";
import { getTenantId, scopeFilter } from "../../middlewares/scope";

const router = Router();

// Per-IP ceiling (generous — a shared office NAT must not trip it) …
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts — try again later" },
});

// … and a strict per-account (IP+email) limit against credential stuffing.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String((req.body as { email?: unknown })?.email ?? "").toLowerCase();
    return `${ipKeyGenerator(req.ip ?? "")}|${email}`;
  },
  message: { error: "Too many login attempts for this account — try again in 15 minutes" },
});

// Record login attempts in the audit log. Fire-and-forget: an audit failure
// must never change the login outcome.
function auditLogin(req: Request, action: string, employeeId: number | null, description: string) {
  void db
    .insert(auditLogTable)
    .values({
      action,
      entityType: "auth",
      entityId: employeeId,
      employeeId,
      description,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })
    .then(
      () => {},
      (err: unknown) => logger.warn({ err }, "Failed to write login audit entry"),
    );
}

declare module "express-session" {
  interface SessionData {
    employeeId: number;
    role: string;
    employeeName?: string;
    tenantId?: number | null;
    tenantName?: string | null;
  }
}

/**
 * Normalize the permissions payload coming from the client into a clean
 * `{ key: true }` map (only truthy entries are kept). Accepts null/undefined
 * (→ null, meaning "use the role default") or an object of booleans.
 */
function sanitizePermissions(input: unknown): Record<string, boolean> | null {
  if (input == null) return null;
  if (typeof input !== "object") return null;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k === "string" && k && v === true) out[k] = true;
  }
  return Object.keys(out).length ? out : null;
}

router.post("/auth/login", loginIpLimiter, loginAccountLimiter, async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [employee] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.email, email.toLowerCase()));
  if (!employee || !employee.isActive) {
    auditLogin(req, "auth.login_failed", employee?.id ?? null, `Failed login for ${email} (unknown or inactive)`);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, employee.passwordHash);
  if (!valid) {
    auditLogin(req, "auth.login_failed", employee.id, `Failed login for ${email} (bad password)`);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Realm isolation: the customer portal and the admin console are separate
  // apps. Platform staff (superadmin/support) may ONLY sign in from the admin
  // console; tenant users may ONLY sign in from the customer portal. Requests
  // without the x-app-realm header (same-origin SPA, curl, webhooks) are
  // unrestricted for backwards compatibility.
  const realm = req.get("x-app-realm");
  const isPlatformStaff = employee.role === "superadmin" || employee.role === "support";
  if (realm === "portal" && isPlatformStaff) {
    auditLogin(req, "auth.login_failed", employee.id, `Realm-blocked login for ${email} (platform staff on customer portal)`);
    res.status(403).json({ error: "حسابات إدارة المنصة تدخل من لوحة الإدارة المخصصة فقط" });
    return;
  }
  if (realm === "admin" && !isPlatformStaff) {
    auditLogin(req, "auth.login_failed", employee.id, `Realm-blocked login for ${email} (tenant user on admin console)`);
    res.status(403).json({ error: "هذه البوابة مخصصة لإدارة المنصة — استخدم بوابة شركتك لتسجيل الدخول" });
    return;
  }

  // Block login for suspended/pending tenants (superadmin has no tenant).
  if (employee.tenantId != null) {
    const [tenantRow] = await db
      .select({ status: tenantsTable.status })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, employee.tenantId))
      .limit(1);
    if (tenantRow && tenantRow.status !== "active") {
      auditLogin(req, "auth.login_failed", employee.id, `Login blocked — tenant ${employee.tenantId} is ${tenantRow.status}`);
      res.status(403).json({
        error:
          tenantRow.status === "suspended"
            ? "حساب شركتك موقوف مؤقتاً — تواصل مع إدارة المنصة لإعادة التفعيل"
            : tenantRow.status === "rejected"
              ? "تم رفض طلب تسجيل شركتك — تواصل مع إدارة المنصة للاستفسار"
              : "حساب شركتك قيد المراجعة والتفعيل — ستتمكن من الدخول فور اعتماد إدارة المنصة",
      });
      return;
    }
  }

  const tenantName = await resolveTenantName(employee.tenantId);

  req.session.employeeId = employee.id;
  req.session.role = employee.role;
  req.session.employeeName = employee.name;
  req.session.tenantId = employee.tenantId ?? null;
  req.session.tenantName = tenantName;

  auditLogin(req, "auth.login_success", employee.id, `Successful login for ${email}`);
  req.log.info({ employeeId: employee.id, tenantId: employee.tenantId }, "Employee logged in");

  res.json({
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      phone: employee.phone,
      isActive: employee.isActive,
      permissions: employee.permissions ?? null,
      tenantId: employee.tenantId ?? null,
      tenantName,
      createdAt: employee.createdAt.toISOString(),
    },
    token: req.sessionID,
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

async function resolveTenantName(tenantId: number | null): Promise<string | null> {
  if (tenantId == null) return null;
  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  return tenant?.name ?? null;
}

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.employeeId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [employee] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, req.session.employeeId));
  if (!employee) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Self-heal sessions created before the SaaS upgrade (no tenant stamp).
  if (req.session.tenantId === undefined) {
    req.session.tenantId = employee.tenantId ?? null;
    req.session.tenantName = await resolveTenantName(employee.tenantId);
  }

  res.json({
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    phone: employee.phone,
    isActive: employee.isActive,
    permissions: employee.permissions ?? null,
    tenantId: employee.tenantId ?? null,
    tenantName: req.session.tenantName ?? null,
    createdAt: employee.createdAt.toISOString(),
  });
});

// Tenant filter for employee queries. Admins only ever see their own company;
// the superadmin sees all (or one company with the x-tenant-id header).
function employeesScope(req: Request): SQL | undefined {
  return scopeFilter(employeesTable.tenantId, getTenantId(req));
}

const isAdminLike = (req: Request) =>
  req.session.role === "admin" || req.session.role === "superadmin";

router.get("/employees", async (req, res): Promise<void> => {
  if (!req.session.employeeId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const employees = await db
    .select()
    .from(employeesTable)
    .where(and(employeesScope(req)))
    .orderBy(employeesTable.createdAt);
  res.json(
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      role: e.role,
      phone: e.phone,
      isActive: e.isActive,
      permissions: e.permissions ?? null,
      tenantId: e.tenantId ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  );
});

router.post("/employees", async (req, res): Promise<void> => {
  if (!req.session.employeeId || !isAdminLike(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, email, password, role, phone, permissions } = req.body as Record<string, unknown>;
  if (!name || !email || !password || !role) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // superadmin + support are platform-level roles — only a superadmin mints them.
  if ((role === "superadmin" || role === "support") && req.session.role !== "superadmin") {
    res.status(403).json({ error: "Only a superadmin may grant a platform-level role" });
    return;
  }

  // Reject duplicate email
  const [existingEmail] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.email, (email as string).toLowerCase()))
    .limit(1);
  if (existingEmail) {
    res.status(409).json({ error: "البريد الإلكتروني مستخدم بالفعل من قِبَل موظف آخر" });
    return;
  }

  const phoneStr = typeof phone === "string" ? phone.trim() : "";

  // Reject duplicate phone (if provided)
  if (phoneStr) {
    const [existingPhone] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.phone, phoneStr))
      .limit(1);
    if (existingPhone) {
      res.status(409).json({ error: "رقم الهاتف مستخدم بالفعل من قِبَل موظف آخر" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password as string, 10);
  const [employee] = await db
    .insert(employeesTable)
    .values({
      name: name as string,
      email: (email as string).toLowerCase(),
      passwordHash,
      role: role as string,
      phone: phoneStr || null,
      permissions: sanitizePermissions(permissions),
      tenantId: getTenantId(req),
    })
    .returning();

  logger.info({ employeeId: employee.id }, "Employee created");
  res.status(201).json({
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    phone: employee.phone,
    isActive: employee.isActive,
    permissions: employee.permissions ?? null,
    createdAt: employee.createdAt.toISOString(),
  });
});

router.patch("/employees/:id", async (req, res): Promise<void> => {
  if (!req.session.employeeId || !isAdminLike(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, email, role, phone, isActive, password, permissions } = req.body as Record<
    string,
    unknown
  >;
  if ((role === "superadmin" || role === "support") && req.session.role !== "superadmin") {
    res.status(403).json({ error: "Only a superadmin may grant a platform-level role" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (email) updates.email = (email as string).toLowerCase();
  if (role) updates.role = role;
  if (phone !== undefined) updates.phone = phone;
  if (isActive !== undefined) updates.isActive = isActive;
  if (password) updates.passwordHash = await bcrypt.hash(password as string, 10);
  if (permissions !== undefined) updates.permissions = sanitizePermissions(permissions);

  const [employee] = await db
    .update(employeesTable)
    .set(updates)
    .where(and(eq(employeesTable.id, id), employeesScope(req)))
    .returning();
  if (!employee) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    phone: employee.phone,
    isActive: employee.isActive,
    permissions: employee.permissions ?? null,
    createdAt: employee.createdAt.toISOString(),
  });
});

// ─── DELETE /api/employees/:id ─────────────────────────────────────────────
router.delete("/employees/:id", async (req, res): Promise<void> => {
  if (!req.session.employeeId || !isAdminLike(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseInt(req.params.id as string, 10);
  if (id === req.session.employeeId) {
    res.status(400).json({ error: "لا يمكنك حذف حسابك أثناء تسجيل الدخول" });
    return;
  }
  const [deleted] = await db
    .delete(employeesTable)
    .where(and(eq(employeesTable.id, id), employeesScope(req)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "الموظف غير موجود" });
    return;
  }
  logger.info({ employeeId: id }, "Employee deleted");
  res.json({ ok: true });
});

export default router;
