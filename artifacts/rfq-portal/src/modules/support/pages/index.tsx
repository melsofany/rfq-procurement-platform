import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supportApi, TICKET_CATEGORIES, type Ticket } from "@/lib/support-api";
import { StatusBadge, categoryLabel, fmtDate } from "@/modules/support/components/ticket-badges";
import { TicketConversation } from "@/modules/support/components/ticket-conversation";
import { LifeBuoy, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SupportPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "technical", priority: "normal", body: "" });

  const { data: tickets = [], isLoading } = useQuery({ queryKey: ["support-tickets"], queryFn: supportApi.list });

  const createMut = useMutation({
    mutationFn: () =>
      supportApi.create({ subject: form.subject, body: form.body, category: form.category, priority: form.priority }),
    onSuccess: (t) => {
      toast.success(`تم إنشاء التذكرة ${t.ticketNo} — سيتواصل معك فريق الدعم`);
      setCreateOpen(false);
      setForm({ subject: "", category: "technical", priority: "normal", body: "" });
      setSelectedId(t.id);
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message || "تعذر إنشاء التذكرة"),
  });

  return (
    <Layout>
      <div dir="rtl" className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LifeBuoy className="h-6 w-6" /> الدعم الفني
            </h1>
            <p className="text-muted-foreground text-sm">ارفع شكوى أو استفساراً لفريق دعم المنصة وتابع الردود</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" /> تذكرة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-lg">
              <DialogHeader>
                <DialogTitle>تذكرة دعم جديدة</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">الموضوع *</label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">النوع</label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TICKET_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.ar}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">الأولوية</label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">منخفضة</SelectItem>
                        <SelectItem value="normal">عادية</SelectItem>
                        <SelectItem value="high">عالية</SelectItem>
                        <SelectItem value="urgent">عاجلة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">وصف المشكلة *</label>
                  <Textarea
                    rows={5}
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="اشرح المشكلة بالتفصيل…"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!form.subject.trim() || !form.body.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                  إرسال التذكرة
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">جارٍ التحميل…</p>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              لا توجد تذاكر بعد — اضغط «تذكرة جديدة» لرفع أول شكوى أو استفسار.
            </CardContent>
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
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span dir="ltr">{t.ticketNo}</span>
                    <span>
                      {categoryLabel(t.category)} · {fmtDate(t.createdAt)} · {t.messageCount ?? 0} رد
                    </span>
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
                      queryKey={["support-ticket", selectedId]}
                      fetchTicket={() => supportApi.get(selectedId)}
                      onReply={(body) => supportApi.reply(selectedId, body)}
                      onChanged={() => qc.invalidateQueries({ queryKey: ["support-tickets"] })}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-10 text-center text-muted-foreground">
                    اختر تذكرة من القائمة لعرض المحادثة.
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
