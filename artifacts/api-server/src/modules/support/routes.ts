/**
 * Support tickets — تذاكر الدعم الفني.
 *
 * Company side (tenant):    /support/tickets[...]        — raise + track tickets.
 * Platform side (superadmin/support employee): /platform/tickets[...] — inbox, reply, resolve.
 */
import { Router, type Request } from "express";
import {
  db,
  supportTicketsTable,
  supportTicketMessagesTable,
  tenantsTable,
  auditLogTable,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireRole } from "../../middlewares/auth";
import { getTenantId, stampTenantId } from "../../middlewares/scope";

const router: ReturnType<typeof Router> = Router();

function senderName(req: Request): string {
  return (req.session as { employeeName?: string }).employeeName ?? "—";
}

function audit(req: Request, action: string, ticketId: number, description: string, tenantId: number | null) {
  void db
    .insert(auditLogTable)
    .values({
      action,
      entityType: "support_ticket",
      entityId: ticketId,
      employeeId: req.session.employeeId ?? null,
      description,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      tenantId,
    })
    .then(() => {}, () => {});
}

async function nextTicketNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TK-${year}-`;
  const rows = await db
    .select({ maxNo: sql<string>`max(${supportTicketsTable.ticketNo})` })
    .from(supportTicketsTable);
  const maxNo = rows[0]?.maxNo ?? null;
  const seq = maxNo ? parseInt(maxNo.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(6, "0")}`;
}

function serializeTicket(t: typeof supportTicketsTable.$inferSelect, messageCount?: number) {
  return {
    id: t.id,
    ticketNo: t.ticketNo,
    tenantId: t.tenantId,
    tenantName: t.tenantName,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    createdByName: t.createdByName,
    assignedToName: t.assignedToName,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...(messageCount !== undefined ? { messageCount } : {}),
  };
}

// ─── Company side (tenant self-service) ────────────────────────────────────
router.get("/support/tickets", async (req, res): Promise<void> => {
  const tenantId = stampTenantId(req);
  if (!tenantId) {
    res.status(400).json({ error: "لا يوجد شركة مرتبطة بحسابك" });
    return;
  }
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.tenantId, tenantId))
    .orderBy(desc(supportTicketsTable.createdAt));
  const msgs = await db
    .select({ ticketId: supportTicketMessagesTable.ticketId, cnt: sql<number>`count(*)::int` })
    .from(supportTicketMessagesTable)
    .groupBy(supportTicketMessagesTable.ticketId);
  const countByTicket = new Map(msgs.map((m) => [m.ticketId, m.cnt]));
  res.json(tickets.map((t) => serializeTicket(t, countByTicket.get(t.id) ?? 0)));
});

router.post("/support/tickets", async (req, res): Promise<void> => {
  const tenantId = stampTenantId(req);
  if (!tenantId) {
    res.status(400).json({ error: "لا يوجد شركة مرتبطة بحسابك" });
    return;
  }
  const { subject, body, category, priority } = req.body as Record<string, unknown>;
  if (!subject || !String(subject).trim() || !body || !String(body).trim()) {
    res.status(400).json({ error: "الموضوع والرسالة مطلوبان" });
    return;
  }
  if (priority && !TICKET_PRIORITIES.includes(priority as (typeof TICKET_PRIORITIES)[number])) {
    res.status(400).json({ error: "أولوية غير صالحة" });
    return;
  }
  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const ticketNo = await nextTicketNo();
  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      ticketNo,
      tenantId,
      tenantName: tenant?.name ?? null,
      subject: String(subject).trim(),
      category: category ? String(category).trim() : null,
      priority: (priority as (typeof TICKET_PRIORITIES)[number]) ?? "normal",
      status: "open",
      createdById: req.session.employeeId ?? null,
      createdByName: senderName(req),
    })
    .returning();
  await db.insert(supportTicketMessagesTable).values({
    ticketId: ticket.id,
    senderId: req.session.employeeId ?? null,
    senderName: senderName(req),
    senderKind: "tenant",
    body: String(body).trim(),
  });
  audit(req, "support.ticket_created", ticket.id, `Ticket ${ticketNo}: ${ticket.subject}`, tenantId);
  res.status(201).json(serializeTicket(ticket, 1));
});

async function loadOwnTicket(
  req: Request,
  idParam: string | string[],
): Promise<{ error: 400 | 404 } | { ticket: typeof supportTicketsTable.$inferSelect; tenantId: number }> {
  const tenantId = stampTenantId(req);
  if (!tenantId) return { error: 400 as const };
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return { error: 404 as const };
  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, id))
    .limit(1);
  if (!ticket || ticket.tenantId !== tenantId) return { error: 404 as const };
  return { ticket, tenantId };
}

router.get("/support/tickets/:id", async (req, res): Promise<void> => {
  const result = await loadOwnTicket(req, req.params.id);
  if ("error" in result) {
    res.status(result.error).json({ error: result.error === 400 ? "لا يوجد شركة مرتبطة بحسابك" : "التذكرة غير موجودة" });
    return;
  }
  const messages = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(eq(supportTicketMessagesTable.ticketId, result.ticket.id));
  messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  res.json({
    ...serializeTicket(result.ticket, messages.length),
    messages: messages.map((m) => ({
      id: m.id,
      senderName: m.senderName,
      senderKind: m.senderKind,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.post("/support/tickets/:id/replies", async (req, res): Promise<void> => {
  const result = await loadOwnTicket(req, req.params.id);
  if ("error" in result) {
    res.status(result.error).json({ error: result.error === 400 ? "لا يوجد شركة مرتبطة بحسابك" : "التذكرة غير موجودة" });
    return;
  }
  const { body } = req.body as Record<string, unknown>;
  if (!body || !String(body).trim()) {
    res.status(400).json({ error: "نص الرد مطلوب" });
    return;
  }
  await db.insert(supportTicketMessagesTable).values({
    ticketId: result.ticket.id,
    senderId: req.session.employeeId ?? null,
    senderName: senderName(req),
    senderKind: "tenant",
    body: String(body).trim(),
  });
  // A tenant reply on a resolved ticket reopens it.
  if (result.ticket.status === "resolved") {
    await db
      .update(supportTicketsTable)
      .set({ status: "open", resolvedAt: null })
      .where(eq(supportTicketsTable.id, result.ticket.id));
  }
  res.status(201).json({ ok: true });
});

// ─── Platform side (superadmin + support employee) ─────────────────────────
router.get(
  "/platform/tickets",
  requireRole("superadmin", "support"),
  async (req, res): Promise<void> => {
    const tickets = await db.select().from(supportTicketsTable).orderBy(desc(supportTicketsTable.createdAt));
    const status = String(req.query.status ?? "");
    const tenantId = parseInt(String(req.query.tenantId ?? ""), 10);
    const filtered = tickets.filter(
      (t) =>
        (!status || t.status === status) &&
        (!Number.isFinite(tenantId) || t.tenantId === tenantId),
    );
    const msgs = await db
      .select({ ticketId: supportTicketMessagesTable.ticketId, cnt: sql<number>`count(*)::int` })
      .from(supportTicketMessagesTable)
      .groupBy(supportTicketMessagesTable.ticketId);
    const countByTicket = new Map(msgs.map((m) => [m.ticketId, m.cnt]));
    res.json(filtered.map((t) => serializeTicket(t, countByTicket.get(t.id) ?? 0)));
  },
);

router.get(
  "/platform/tickets/:id",
  requireRole("superadmin", "support"),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).limit(1);
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const messages = await db
      .select()
      .from(supportTicketMessagesTable)
      .where(eq(supportTicketMessagesTable.ticketId, id));
    messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    res.json({
      ...serializeTicket(ticket, messages.length),
      messages: messages.map((m) => ({
        id: m.id,
        senderName: m.senderName,
        senderKind: m.senderKind,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  },
);

router.post(
  "/platform/tickets/:id/replies",
  requireRole("superadmin", "support"),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).limit(1);
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const { body } = req.body as Record<string, unknown>;
    if (!body || !String(body).trim()) {
      res.status(400).json({ error: "نص الرد مطلوب" });
      return;
    }
    await db.insert(supportTicketMessagesTable).values({
      ticketId: id,
      senderId: req.session.employeeId ?? null,
      senderName: senderName(req),
      senderKind: "support",
      body: String(body).trim(),
    });
    // Replying claims the ticket: assign to the responder + mark in_progress.
    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        status: ticket.status === "open" ? "in_progress" : ticket.status,
        assignedToName: senderName(req),
      })
      .where(eq(supportTicketsTable.id, id))
      .returning();
    audit(req, "support.ticket_replied", id, `Reply on ${ticket.ticketNo}`, getTenantId(req));
    res.status(201).json({ ok: true, status: updated?.status ?? ticket.status });
  },
);

router.patch(
  "/platform/tickets/:id",
  requireRole("superadmin", "support"),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const { status, priority, assignedToName } = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (status !== undefined) {
      if (!TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
        res.status(400).json({ error: "حالة غير صالحة" });
        return;
      }
      updates.status = status;
      updates.resolvedAt = status === "resolved" ? new Date() : null;
    }
    if (priority !== undefined) {
      if (!TICKET_PRIORITIES.includes(priority as (typeof TICKET_PRIORITIES)[number])) {
        res.status(400).json({ error: "أولوية غير صالحة" });
        return;
      }
      updates.priority = priority;
    }
    if (assignedToName !== undefined)
      updates.assignedToName = assignedToName == null ? null : String(assignedToName);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد حقول للتحديث" });
      return;
    }
    const [ticket] = await db
      .update(supportTicketsTable)
      .set(updates)
      .where(eq(supportTicketsTable.id, id))
      .returning();
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    audit(req, "support.ticket_updated", id, `Ticket ${ticket.ticketNo} → ${JSON.stringify(updates)}`, getTenantId(req));
    res.json(serializeTicket(ticket));
  },
);

export default router;
