import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { currentTenant } from "../middlewares/tenant-context";
import { logger } from "./logger";

/**
 * Tenant-aware brand resolution for PDFs/emails. Falls back to
 * APP_BRAND_* env vars, then to neutral product branding.
 */
export interface BrandInfo {
  nameAr: string;
  nameEn: string;
  email: string;
  address?: string | null;
}

const GENERIC: BrandInfo = {
  nameAr: process.env.APP_BRAND_NAME_AR || "منصة تسعير المشتريات",
  nameEn: process.env.APP_BRAND_NAME_EN || "RFQ Platform",
  email: process.env.APP_BRAND_EMAIL || "info@rfq-platform.com",
  address: process.env.APP_BRAND_ADDRESS || null,
};

const cache = new Map<number, { at: number; brand: BrandInfo }>();
const TTL_MS = 60_000;

export async function resolveBrand(): Promise<BrandInfo> {
  const tenantId = currentTenant();
  if (tenantId == null) return GENERIC;
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brand;
  try {
    const [tenant] = await db
      .select({ name: tenantsTable.name, nameEn: tenantsTable.nameEn })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);
    if (tenant) {
      const brand: BrandInfo = {
        ...GENERIC,
        nameAr: tenant.name || GENERIC.nameAr,
        nameEn: tenant.nameEn || tenant.name || GENERIC.nameEn,
      };
      cache.set(tenantId, { at: Date.now(), brand });
      return brand;
    }
  } catch (err) {
    logger.warn({ err, tenantId }, "resolveBrand: lookup failed — generic fallback");
  }
  return GENERIC;
}
