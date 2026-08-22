import { Router } from "express";
import {
  db,
  tenantWhatsappSettingsTable,
  tenantsTable,
  tenantSubscriptionsTable,
  subscriptionPlansTable,
  auditLogTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../../middlewares/auth";
import { stampTenantId } from "../../middlewares/scope";

/**
 * Tenant self-service settings — the company admin manages their own
 * company's WhatsApp Cloud API credentials (the platform superadmin manages
 * any tenant via /platform/tenants/:id/whatsapp).
 */
const router = Router();

function maskSecret(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

router.get(
  "/settings/whatsapp",
  requireRole("admin", "manager", "superadmin"),
  async (req, res): Promise<void> => {
    const tenantId = stampTenantId(req);
    if (!tenantId) {
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
    const [row] = await db
      .select()
      .from(tenantWhatsappSettingsTable)
      .where(eq(tenantWhatsappSettingsTable.tenantId, tenantId))
      .limit(1);
    res.json({
      configured: Boolean(row),
      enabled: row?.enabled ?? false,
      phoneNumberId: row?.phoneNumberId ?? null,
      wabaId: row?.wabaId ?? null,
      displayPhone: row?.displayPhone ?? null,
      accessTokenMasked: maskSecret(row?.accessToken ?? null),
    });
  },
);

router.put(
  "/settings/whatsapp",
  requireRole("admin", "manager", "superadmin"),
  async (req, res): Promise<void> => {
    const tenantId = stampTenantId(req);
    if (!tenantId) {
      res.status(400).json({ error: "لا يوجد شركة مرتبطة بحسابك" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : null;
    const wabaId = typeof body.wabaId === "string" ? body.wabaId.trim() : null;
    const displayPhone = typeof body.displayPhone === "string" ? body.displayPhone.trim() : null;
    // Blank secret fields mean "keep the stored value".
    const accessToken =
      typeof body.accessToken === "string" && body.accessToken.trim()
        ? body.accessToken.trim()
        : undefined;
    const enabled = body.enabled === undefined ? undefined : Boolean(body.enabled);

    const [existing] = await db
      .select()
      .from(tenantWhatsappSettingsTable)
      .where(eq(tenantWhatsappSettingsTable.tenantId, tenantId))
      .limit(1);

    const finalToken = accessToken ?? existing?.accessToken ?? null;
    const finalEnabled =
      enabled ?? (existing ? existing.enabled : Boolean(phoneNumberId && finalToken));

    const [row] = await db
      .insert(tenantWhatsappSettingsTable)
      .values({
        tenantId,
        phoneNumberId,
        accessToken: finalToken,
        wabaId,
        displayPhone,
        enabled: finalEnabled,
        updatedByName: req.session.employeeName ?? null,
      })
      .onConflictDoUpdate({
        target: tenantWhatsappSettingsTable.tenantId,
        set: {
          phoneNumberId,
          accessToken: finalToken,
          wabaId,
          displayPhone,
          enabled: finalEnabled,
          updatedByName: req.session.employeeName ?? null,
        },
      })
      .returning();

    void db
      .insert(auditLogTable)
      .values({
        action: "settings.whatsapp.updated",
        entityType: "settings",
        entityId: tenantId,
        employeeId: req.session.employeeId ?? null,
        description: "Tenant WhatsApp settings updated",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        tenantId,
      })
      .then(() => {}, () => {});

    res.json({
      ok: true,
      configured: true,
      enabled: row.enabled,
      phoneNumberId: row.phoneNumberId,
      wabaId: row.wabaId,
      displayPhone: row.displayPhone,
      accessTokenMasked: maskSecret(row.accessToken),
    });
  },
);

// ─── Company profile (self-service) ────────────────────────────────────────
router.get(
  "/settings/company",
  requireRole("admin", "manager", "superadmin"),
  async (req, res): Promise<void> => {
    const tenantId = stampTenantId(req);
    if (!tenantId) {
      res.status(400).json({ error: "لا يوجد شركة مرتبطة بحسابك" });
      return;
    }
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);
    if (!tenant) {
      res.status(404).json({ error: "الشركة غير موجودة" });
      return;
    }
    const subs = await db
      .select()
      .from(tenantSubscriptionsTable)
      .where(eq(tenantSubscriptionsTable.tenantId, tenantId));
    const plans = await db.select().from(subscriptionPlansTable);
    const planById = new Map(plans.map((p) => [p.id, p]));
    const current =
      subs.find((s) => s.status === "active") ?? subs.find((s) => s.status === "trialing") ?? null;
    const plan = current ? planById.get(current.planId) ?? null : null;
    const [wa] = await db
      .select({ enabled: tenantWhatsappSettingsTable.enabled })
      .from(tenantWhatsappSettingsTable)
      .where(eq(tenantWhatsappSettingsTable.tenantId, tenantId))
      .limit(1);
    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        nameEn: tenant.nameEn,
        slug: tenant.slug,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
        status: tenant.status,
        notes: tenant.notes,
      },
      subscription: current
        ? {
            id: current.id,
            status: current.status,
            startsAt: current.startsAt,
            endsAt: current.endsAt,
            plan: plan
              ? {
                  nameAr: plan.nameAr,
                  nameEn: plan.nameEn,
                  monthlyPrice: plan.monthlyPrice,
                  currency: plan.currency,
                  maxUsers: plan.maxUsers,
                }
              : null,
          }
        : null,
      whatsappConfigured: Boolean(wa?.enabled),
    });
  },
);

router.patch(
  "/settings/company",
  requireRole("admin", "superadmin"),
  async (req, res): Promise<void> => {
    const tenantId = stampTenantId(req);
    if (!tenantId) {
      res.status(400).json({ error: "لا يوجد شركة مرتبطة بحسابك" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    // Company admin may edit only contact details — name/status/subscription
    // stay under platform-superadmin control.
    if (body.contactEmail !== undefined)
      updates.contactEmail = body.contactEmail == null ? null : String(body.contactEmail);
    if (body.contactPhone !== undefined)
      updates.contactPhone = body.contactPhone == null ? null : String(body.contactPhone);
    if (body.notes !== undefined) updates.notes = body.notes == null ? null : String(body.notes);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد حقول للتحديث" });
      return;
    }
    const [tenant] = await db
      .update(tenantsTable)
      .set(updates)
      .where(eq(tenantsTable.id, tenantId))
      .returning();
    if (!tenant) {
      res.status(404).json({ error: "الشركة غير موجودة" });
      return;
    }
    void db
      .insert(auditLogTable)
      .values({
        action: "settings.company.updated",
        entityType: "settings",
        entityId: tenantId,
        employeeId: req.session.employeeId ?? null,
        description: `Company profile updated (${Object.keys(updates).join(", ")})`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        tenantId,
      })
      .then(() => {}, () => {});
    res.json({
      ok: true,
      tenant: {
        id: tenant.id,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
        notes: tenant.notes,
      },
    });
  },
);

export default router;
