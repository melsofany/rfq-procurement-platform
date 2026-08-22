import { Router } from "express";
import { db, tenantWhatsappSettingsTable, auditLogTable } from "@workspace/db";
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

export default router;
