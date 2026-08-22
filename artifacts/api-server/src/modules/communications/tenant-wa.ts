import { WhatsAppAPI } from "whatsapp-api-js";
import { db, tenantWhatsappSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantAls } from "../../middlewares/tenant-context";
import { logger } from "../../shared/logger";

/**
 * Per-tenant WhatsApp Cloud API resolution.
 *
 * A tenant may attach its own Meta credentials via the superadmin UI
 * (tenant_whatsapp_settings). When no tenant config exists — or no tenant is
 * in scope (webhooks, background jobs) — resolution falls back to the process
 * env credentials, preserving pre-SaaS behavior.
 */

const ENV_PHONE_NUMBER_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER || "";
const ENV_TOKEN = process.env.WHATSAPP_TOKEN || "";

export interface ResolvedWhatsAppConfig {
  tenantId: number | null;
  phoneNumberId: string;
  token: string;
  wabaId?: string | null;
  source: "env" | "tenant";
  configured: boolean;
}

const CONFIG_TTL_MS = 60_000;
const configCache = new Map<number, { at: number; cfg: ResolvedWhatsAppConfig }>();
const clientCache = new Map<string, WhatsAppAPI>();

export async function resolveWhatsAppConfig(
  tenantId: number | null | undefined,
): Promise<ResolvedWhatsAppConfig> {
  if (typeof tenantId === "number") {
    const cached = configCache.get(tenantId);
    if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.cfg;
    let cfg: ResolvedWhatsAppConfig;
    try {
      const [row] = await db
        .select()
        .from(tenantWhatsappSettingsTable)
        .where(eq(tenantWhatsappSettingsTable.tenantId, tenantId))
        .limit(1);
      if (row?.enabled && row.phoneNumberId && row.accessToken) {
        cfg = {
          tenantId,
          phoneNumberId: row.phoneNumberId,
          token: row.accessToken,
          wabaId: row.wabaId,
          source: "tenant",
          configured: true,
        };
      } else {
        cfg = envFallback(tenantId);
      }
    } catch (err) {
      logger.warn({ err, tenantId }, "resolveWhatsAppConfig: lookup failed — env fallback");
      cfg = envFallback(tenantId);
    }
    configCache.set(tenantId, { at: Date.now(), cfg });
    return cfg;
  }
  return envFallback(tenantId ?? null);
}

function envFallback(tenantId: number | null): ResolvedWhatsAppConfig {
  return {
    tenantId,
    phoneNumberId: ENV_PHONE_NUMBER_ID,
    token: ENV_TOKEN,
    wabaId: null,
    source: "env",
    configured: Boolean(ENV_PHONE_NUMBER_ID && ENV_TOKEN),
  };
}

function clientForToken(token: string): WhatsAppAPI {
  const cached = clientCache.get(token);
  if (cached) return cached;
  const client = new WhatsAppAPI({ token: token || "unconfigured", secure: false });
  clientCache.set(token, client);
  return client;
}

export interface WaChannel {
  client: WhatsAppAPI;
  phoneNumberId: string;
  configured: boolean;
  source: "env" | "tenant";
}

/** Resolve the channel for the caller's ALS tenant (env fallback otherwise). */
export async function waChannel(): Promise<WaChannel> {
  const tenantId = tenantAls.getStore()?.tenantId ?? null;
  const cfg = await resolveWhatsAppConfig(tenantId);
  return {
    client: clientForToken(cfg.token),
    phoneNumberId: cfg.phoneNumberId,
    configured: cfg.configured,
    source: cfg.source,
  };
}

/** Evict cached config for a tenant after admin edits (optional correctness). */
export function invalidateTenantConfig(tenantId: number): void {
  configCache.delete(tenantId);
}

/** Tenant-aware replacement for the env-only `isWhatsAppConfigured` flag:
 *  true when the current tenant (ALS scope) or the process env has a
 *  phone-number-id + token pair. */
export async function isWhatsAppAvailable(): Promise<boolean> {
  return (await waChannel()).configured;
}

// ─── Reverse lookup used by the inbound webhook ───────────────────────────
let reverseCache: { at: number; map: Map<string, number> } | null = null;

export async function resolveTenantByPhoneNumberId(
  phoneNumberId: string | undefined | null,
): Promise<number | null> {
  if (!phoneNumberId) return null;
  if (!reverseCache || Date.now() - reverseCache.at > CONFIG_TTL_MS) {
    try {
      const rows = await db
        .select({
          tenantId: tenantWhatsappSettingsTable.tenantId,
          phoneNumberId: tenantWhatsappSettingsTable.phoneNumberId,
        })
        .from(tenantWhatsappSettingsTable)
        .where(eq(tenantWhatsappSettingsTable.enabled, true));
      reverseCache = {
        at: Date.now(),
        map: new Map(rows.filter((r) => r.phoneNumberId).map((r) => [r.phoneNumberId as string, r.tenantId])),
      };
    } catch (err) {
      logger.warn({ err }, "resolveTenantByPhoneNumberId: lookup failed");
      reverseCache = { at: Date.now(), map: new Map() };
    }
  }
  return reverseCache.map.get(phoneNumberId) ?? null;
}
