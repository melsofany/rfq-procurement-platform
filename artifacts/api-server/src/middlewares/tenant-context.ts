import { AsyncLocalStorage } from "async_hooks";
import type { Request, Response, NextFunction } from "express";
import { getTenantId } from "./scope";

/**
 * Request-scoped tenant context (AsyncLocalStorage). Express handlers run
 * inside the store, so any downstream code (e.g. WhatsApp send helpers) can
 * resolve the effective tenant without plumbing it through every signature.
 *
 * Mounted in app.ts AFTER the session middleware so the session-derived
 * tenant is captured (webhooks with no session resolve to null → env config).
 */
export const tenantAls = new AsyncLocalStorage<{ tenantId: number | null }>();

export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  tenantAls.run({ tenantId: getTenantId(req) }, () => next());
}

export function currentTenant(): number | null | undefined {
  return tenantAls.getStore()?.tenantId;
}
