import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./saas";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const representativesTable = pgTable("representatives", {
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertRepresentativeSchema = createInsertSchema(representativesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRepresentative = z.infer<typeof insertRepresentativeSchema>;
export type Representative = typeof representativesTable.$inferSelect;
