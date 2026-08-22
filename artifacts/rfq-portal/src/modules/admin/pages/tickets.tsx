import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ticketsAdminApi, type Ticket } from "@/lib/support-api";
import { platformApi } from "@/lib/platform-api";
import {
  StatusBadge,
  PriorityBadge,
  categoryLabel,
  fmtDate,
} from "@/modules/support/components/ticket-badges";
import { TicketConversation } from "@/modules/support/components/ticket-conversation";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";

export default function AdminTicketsPage() {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const allowed = employee?.role === "superadmin" || employee?.role === "support";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");

  const { data: tenants = [] } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => platformApi.listTenants(),
    enabled: employee?.role === "superadmin",
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["platform-tickets", statusFilter, tenantFilter],
    queryFn: () =>
      ticketsAdminApi.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        tenantId: tenantFilter === "all" ? undefined : parseInt(tenantFilter, 10),
      }),
    enabled: allowed,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => ticketsAdminApi.update(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-tickets"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["platform-ticket", selectedId] });
      toast.success("تم تحديث التذكرة");
    },
    onError: (e: Error) => toast.error(e.message || "تعذر تحديث التذكرة"),
  });

  if (!allowed) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">غير مصرح لك بالوصول لهذه الصفحة.</div>
      </Layout>
    );
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;

  return (
    <Layout>
      <div dir="rtl" className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LifeBuoy className="h-6 w-6" /> تذاكر الدعم
            </h1>
            <p className="text-muted-foreground text-sm">
              {openCount} مفتوحة · {inProgressCount} قيد المعالجة
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="open">مفتوحة</SelectItem>
                <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                <SelectItem value="resolved">تم الحل</SelectItem>
                <SelectItem value="closed">مغلقة</SelectItem>
              </SelectContent>
            </Select>
            {employee?.role === "superadmin" && tenants.length > 0 && (
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="الشركة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الشركات</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">جارٍ التحميل…</p>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">لا توجد تذاكر مطابقة.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2 space-y-2">
              {tickets.map((t: Ticket) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-right rounded-lg border p-3 transition-colors ${
                    selectedId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground gap-2">
                    <span className="truncate">{t.tenantName ?? `شركة #${t.tenantId}`}</span>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span dir="ltr">{t.ticketNo}</span>
                    <span>{fmtDate(t.createdAt)} · {t.messageCount ?? 0} رد</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="lg:col-span-3">
              {selectedId ? (
                <Card>
                  <CardContent className="p-4">
                    <TicketConversation
                      ticketId={selectedId}
                      queryKey={["platform-ticket", selectedId]}
                      fetchTicket={() => ticketsAdminApi.get(selectedId)}
                      onReply={(body) => ticketsAdminApi.reply(selectedId, body)}
                      onChanged={() => qc.invalidateQueries({ queryKey: ["platform-tickets"] })}
                      replyPlaceholder="اكتب رد فريق الدعم…"
                      headerExtra={
                        <div className="flex gap-2">
                          <Select
                            onValueChange={(v) => updateMut.mutate({ id: selectedId, status: v })}
                            disabled={updateMut.isPending}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue placeholder="تغيير الحالة" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">مفتوحة</SelectItem>
                              <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                              <SelectItem value="resolved">تم الحل</SelectItem>
                              <SelectItem value="closed">مغلقة</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      }
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-10 text-center text-muted-foreground">
                    اختر تذكرة من القائمة للرد عليها.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
