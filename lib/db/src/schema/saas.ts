import { pgTable, text, serial, timestamp, integer, boolean, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── SaaS platform: tenants (companies) + subscription plans + subscriptions ─
// A tenant is one customer company using the platform. Superadmins manage
// tenants/plans/subscriptions from the /admin page; tenant admins manage only
// their own company's employees and data.

export const TENANT_STATUSES = ["active", "suspended", "pending"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  slug: text("slug").notNull().unique(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status: text("status").notNull().default("active").$type<TenantStatus>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;

// ─── Subscription plans (باقات الاشتراك) ──────────────────────────────────
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  monthlyPrice: numeric("monthly_price", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("EGP"),
  maxUsers: integer("max_users"),
  features: jsonb("features").$type<Record<string, boolean>>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

// ─── Tenant subscriptions (اشتراكات الشركات) ───────────────────────────────
export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const tenantSubscriptionsTable = pgTable("tenant_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => subscriptionPlansTable.id),
  status: text("status").notNull().default("active").$type<SubscriptionStatus>(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at"),
  notes: text("notes"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTenantSubscriptionSchema = createInsertSchema(tenantSubscriptionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTenantSubscription = z.infer<typeof insertTenantSubscriptionSchema>;
export type TenantSubscription = typeof tenantSubscriptionsTable.$inferSelect;

// ─── Per-tenant WhatsApp Cloud API config ──────────────────────────────────
// Each company may attach its own Meta Cloud API credentials. Access tokens
// are stored server-side only — the GET endpoint returns a masked preview.
export const tenantWhatsappSettingsTable = pgTable("tenant_whatsapp_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  phoneNumberId: text("phone_number_id"),
  accessToken: text("access_token"),
  wabaId: text("waba_id"),
  webhookVerifyToken: text("webhook_verify_token"),
  displayPhone: text("display_phone"),
  enabled: boolean("enabled").notNull().default(false),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTenantWhatsappSettingsSchema = createInsertSchema(tenantWhatsappSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTenantWhatsappSettings = z.infer<typeof insertTenantWhatsappSettingsSchema>;
export type TenantWhatsappSettings = typeof tenantWhatsappSettingsTable.$inferSelect;

// Sentinel: the seeded platform-default tenant that pre-existing data attaches
// to (created idempotently on startup). Employees/rows with a NULL tenant_id
// are treated as the default tenant for backwards compatibility.
export const DEFAULT_TENANT_SLUG = "default";
