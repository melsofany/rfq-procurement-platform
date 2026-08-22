import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { settingsApi } from "@/lib/platform-api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building, CreditCard, MessageSquare, Settings } from "lucide-react";
import WhatsappTab from "./whatsapp";

const TENANT_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "نشطة", cls: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "موقوفة", cls: "bg-red-100 text-red-700" },
  pending: { label: "قيد التفعيل", cls: "bg-amber-100 text-amber-700" },
};

const SUB_STATUS: Record<string, string> = {
  active: "نشط",
  trialing: "تجريبي",
  past_due: "متأخر السداد",
  canceled: "ملغي",
  expired: "منتهي",
};

function CompanyTab() {
  const { employee } = useAuth();
  const canEdit = employee?.role === "admin" || employee?.role === "superadmin";
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/settings/company"],
    queryFn: settingsApi.getCompany,
  });

  const [form, setForm] = useState({ contactEmail: "", contactPhone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        contactEmail: data.tenant.contactEmail ?? "",
        contactPhone: data.tenant.contactPhone ?? "",
        notes: data.tenant.notes ?? "",
      });
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await settingsApi.updateCompany({
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        notes: form.notes.trim() || null,
      });
      toast.success("تم حفظ بيانات الشركة");
      queryClient.invalidateQueries({ queryKey: ["/api/settings/company"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">جارٍ التحميل…</p>;
  if (error) return <p className="text-sm text-red-600 p-4">{(error as Error).message}</p>;
  if (!data) return null;

  const st = TENANT_STATUS[data.tenant.status] ?? TENANT_STATUS.pending;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-lg">{data.tenant.name}</p>
            {data.tenant.nameEn && <p className="text-sm text-muted-foreground" dir="ltr">{data.tenant.nameEn}</p>}
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>البريد الإلكتروني للتواصل</Label>
            <Input
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              dir="ltr"
              type="email"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label>هاتف التواصل</Label>
            <Input
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              dir="ltr"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>ملاحظات</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            disabled={!canEdit}
          />
        </div>

        {canEdit && (
          <Button onClick={save} disabled={saving}>
            {saving ? "جارٍ الحفظ…" : "حفظ البيانات"}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        اسم الشركة وحالة الحساب تُدار من مسؤول المنصة — للتعديل تواصل مع إدارة المنصة.
      </p>
    </div>
  );
}

function SubscriptionTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/settings/company"],
    queryFn: settingsApi.getCompany,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">جارٍ التحميل…</p>;
  if (error) return <p className="text-sm text-red-600 p-4">{(error as Error).message}</p>;
  if (!data) return null;

  const sub = data.subscription;

  return (
    <div className="space-y-5 max-w-2xl">
      {sub ? (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-lg">{sub.plan?.nameAr ?? "—"}</p>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
              {SUB_STATUS[sub.status] ?? sub.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <p className="text-muted-foreground">تاريخ البدء:</p>
            <p>{new Date(sub.startsAt).toLocaleDateString("ar-EG")}</p>
            <p className="text-muted-foreground">تاريخ الانتهاء:</p>
            <p>{sub.endsAt ? new Date(sub.endsAt).toLocaleDateString("ar-EG") : "غير محدد"}</p>
            <p className="text-muted-foreground">السعر الشهري:</p>
            <p>
              {sub.plan?.monthlyPrice ?? "—"} {sub.plan?.currency ?? ""}
            </p>
            <p className="text-muted-foreground">أقصى عدد مستخدمين:</p>
            <p>{sub.plan?.maxUsers ?? "غير محدود"}</p>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-4 text-sm">
          لا يوجد اشتراك فعّال حالياً — تواصل مع إدارة المنصة لتفعيل باقة.
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        الاشتراكات والباقات تُدار من مسؤول المنصة. للترقية أو التجديد تواصل مع إدارة المنصة.
      </p>
    </div>
  );
}

/**
 * Company settings — the company admin's self-service page. Platform-level
 * subscription/tenant management lives on /admin (superadmin only).
 */
export default function SettingsPage() {
  const { employee } = useAuth();
  const canAccess =
    employee?.role === "admin" || employee?.role === "manager" || employee?.role === "superadmin";

  const [tab, setTab] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    return q === "whatsapp" || q === "subscription" ? q : "company";
  });

  const selectTab = (v: string) => {
    setTab(v);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", v);
    window.history.replaceState(null, "", url.toString());
  };

  if (!canAccess) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">غير مصرح — إعدادات الشركة لمدير الشركة فقط.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Settings size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-bold">إعدادات الشركة</h1>
            <p className="text-sm text-muted-foreground mt-1">
              بيانات شركتك واشتراكك وتكامل واتساب — خاص بمدير الشركة.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={selectTab}>
          <TabsList>
            <TabsTrigger value="company" className="gap-1.5">
              <Building size={14} /> بيانات الشركة
            </TabsTrigger>
            <TabsTrigger value="subscription" className="gap-1.5">
              <CreditCard size={14} /> الاشتراك
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1.5">
              <MessageSquare size={14} /> واتساب
            </TabsTrigger>
          </TabsList>
          <TabsContent value="company" className="mt-4">
            <CompanyTab />
          </TabsContent>
          <TabsContent value="subscription" className="mt-4">
            <SubscriptionTab />
          </TabsContent>
          <TabsContent value="whatsapp" className="mt-4">
            <WhatsappTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
