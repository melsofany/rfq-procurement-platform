/**
 * Public company self-signup.
 *
 * A new company registers itself: we create the tenant with status
 * "pending" (cannot log in until a platform superadmin activates it from
 * /admin/tenants) plus its first admin employee (role "admin" — full page
 * access inside the tenant). The superadmin then reviews the request,
 * assigns a subscription plan, and flips status to "active".
 */
import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { db, tenantsTable, employeesTable, auditLogTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

const router = Router();

// Tight limit — signups are rare and each one creates rows.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل كثيرة — حاول مرة أخرى بعد ساعة" },
});

function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "company";
}

/** Pick a slug that is not taken, suffixing -2, -3, … on collision. */
async function uniqueSlug(base: string): Promise<string> {
  const rows = await db
    .select({ slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(like(tenantsTable.slug, `${base}%`));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

interface SignupBody {
  companyName?: string;
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  notes?: string;
}

router.post("/signup", signupLimiter, async (req, res): Promise<void> => {
  const body = req.body as SignupBody;
  const companyName = (body.companyName ?? "").trim();
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const phone = (body.phone ?? "").trim();
  const notes = (body.notes ?? "").trim();

  if (!companyName || !name || !email || !password) {
    res.status(400).json({ error: "اسم الشركة واسم المسؤول والبريد الإلكتروني وكلمة المرور حقول مطلوبة" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "صيغة البريد الإلكتروني غير صحيحة" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" });
    return;
  }

  const [existingEmail] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.email, email))
    .limit(1);
  if (existingEmail) {
    res.status(409).json({ error: "هذا البريد الإلكتروني مسجل بالفعل — سجّل الدخول أو استخدم بريداً آخر" });
    return;
  }

  const slug = await uniqueSlug(slugify(companyName));
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      name: companyName,
      slug,
      contactEmail: email,
      contactPhone: phone || null,
      status: "pending",
      notes: notes || null,
    })
    .returning();

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(employeesTable).values({
    name,
    email,
    passwordHash,
    role: "admin",
    phone: phone || null,
    tenantId: tenant.id,
  });

  void db
    .insert(auditLogTable)
    .values({
      action: "signup.submitted",
      entityType: "tenant_registration",
      entityId: tenant.id,
      employeeId: null,
      description: `طلب تسجيل شركة جديدة: ${companyName} (${email})`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      tenantId: tenant.id,
    })
    .then(() => {}, () => {});

  res.status(201).json({
    ok: true,
    status: "pending",
    message: "تم استلام طلب التسجيل — سيتم تفعيل حساب شركتك بعد مراجعة إدارة المنصة",
  });
});

export default router;
