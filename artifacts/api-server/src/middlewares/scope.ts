import type { Request } from "express";
import { eq, type SQL, type Column } from "drizzle-orm";

/**
 * Tenant scoping helpers.
 *
 * Session contract (stamped on login, repaired lazily by ensureTenantScope):
 *   - regular user  → session.tenantId = their company id
 *   - superadmin    → session.tenantId absent or null; can impersonate a
 *                     company via the `x-tenant-id` header (admin UI sends it)
 *
 * `getTenantId` returns the effective tenant for reads — null means "platform
 * superadmin, no filter" (sees everything). `stampTenantId` returns the tenant
 * to write on a created row — superadmin without impersonation writes NULL
 * (init-db backfills NULLs to the default tenant on startup).
 */
export interface SessionShape {
  employeeId?: number;
  role?: string;
  tenantId?: number | null;
  tenantName?: string | null;
}

export function getTenantId(req: Request): number | null {
  const s = (req as Request & { session?: SessionShape }).session;
  if (!s) return null;
  if (s.role === "superadmin") {
    const hdr = Number(req.get("x-tenant-id") || "");
    if (Number.isFinite(hdr) && hdr > 0) return hdr;
    return null;
  }
  return s.tenantId ?? null;
}

export function stampTenantId(req: Request): number | null {
  const s = (req as Request & { session?: SessionShape }).session;
  if (!s) return null;
  if (s.role === "superadmin") {
    const hdr = Number(req.get("x-tenant-id") || "");
    if (Number.isFinite(hdr) && hdr > 0) return hdr;
    return null;
  }
  return s.tenantId ?? null;
}

/**
 * `eq(table.tenantId, tenant)` when scoped, undefined for a platform
 * superadmin (no filter). drizzle's `and(...)` silently skips undefined.
 * A missing column (mock tables, legacy) also degrades to undefined.
 */
export function scopeFilter(column: Column | undefined, tenantId: number | null): SQL | undefined {
  if (tenantId == null || !column) return undefined;
  return eq(column, tenantId);
}

export function scopeWhere(table: { tenantId?: Column }, req: Request): SQL | undefined {
  return scopeFilter(table.tenantId, getTenantId(req));
}

/** Stamp a created row with the caller's tenant (superadmin impersonation-aware). */
export function stampTenant<T extends Record<string, unknown>>(
  req: Request,
  values: T,
): T & { tenantId: number | null } {
  return { ...values, tenantId: stampTenantId(req) };
}
