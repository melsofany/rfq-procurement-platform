import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { platformApi, type SubscriptionPlan } from "@/lib/platform-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, CreditCard } from "lucide-react";

const EMPTY = {
  code: "",
  nameAr: "",
  nameEn: "",
  description: "",
  monthlyPrice: "",
  currency: "EGP",
  maxUsers: "",
  whatsappEnabled: true,
};

export default function AdminPlansPage() {
  const { employee } = useAuth();
  const isSuperadmin = employee?.role === "superadmin";
  const queryClient = useQueryClient();

  const { data: plans, isLoading, error } = useQuery({
    queryKey: ["/api/platform/plans"],
    queryFn: platformApi.listPlans,
    enabled: isSuperadmin,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  if (!isSuperadmin) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">غير مصرح — هذه الصفحة لمسؤول المنصة فقط.</div>
      </Layout>
    );
  }

  const openEdit = (p: SubscriptionPlan) => {
    setEditing(p);
    setForm({
      code: p.code,
      nameAr: p.nameAr,
      nameEn: p.nameEn ?? "",
      description: p.description ?? "",
      monthlyPrice: p.monthlyPrice != null ? String(p.monthlyPrice) : "",
      currency: p.currency ?? "EGP",
      maxUsers: p.maxUsers != null ? String(p.maxUsers) : "",
      whatsappEnabled: p.features?.whatsapp !== false,
    });
    setShowCreate(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.nameAr.trim()) {
      toast.error("الكود والاسم بالعربية مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const body = {
        code: form.code.trim(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || null,
        description: form.description.trim() || null,
        monthlyPrice: form.monthlyPrice ? Number(form.monthlyPrice) : null,
        currency: form.currency.trim() || "EGP",
        maxUsers: form.maxUsers ? parseInt(form.maxUsers, 10) : null,
        features: { whatsapp: form.whatsappEnabled },
      };
      if (editing) {
        await platformApi.updatePlan(editing.id, body);
        toast.success("تم تحديث الخطة");
      } else {
        await platformApi.createPlan(body);
        toast.success("تم إنشاء الخطة");
      }
      setShowCreate(false);
      setEditing(null);
      setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/plans"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: SubscriptionPlan) => {
    try {
      await platformApi.updatePlan(p.id, { isActive: !p.isActive });
      toast.success(p.isActive ? "تم إيقاف الخطة" : "تم تفعيل الخطة");
      queryClient.invalidateQueries({ queryKey: ["/api/platform/plans"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">خطط الاشتراك</h1>
            <p className="text-sm text-muted-foreground mt-1">خطط الأسعار المعروضة للشركات المشتركة.</p>
          </div>
          <Button onClick={() => { setEditing(null); setForm(EMPTY); setShowCreate(true); }}>
            <Plus size={16} className="ml-1" /> خطة جديدة
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(plans ?? []).map((p) => (
            <div key={p.id} className={`bg-card border rounded-xl p-5 space-y-3 ${p.isActive ? "border-border" : "border-dashed border-border opacity-60"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-primary" />
                  <h3 className="font-bold">{p.nameAr}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {p.isActive ? "فعّالة" : "موقوفة"}
                </span>
              </div>
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
              <p className="text-2xl font-extrabold">
                {p.monthlyPrice != null ? `${p.monthlyPrice} ${p.currency ?? "EGP"}` : "—"}
                <span className="text-xs font-normal text-muted-foreground"> / شهرياً</span>
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>الكود: <span className="font-mono">{p.code}</span></p>
                <p>أقصى عدد مستخدمين: {p.maxUsers ?? "غير محدود"}</p>
                <p>تكامل واتساب: {p.features?.whatsapp !== false ? "مفعّل" : "غير مفعّل"}</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => openEdit(p)}>تعديل</Button>
                <Button size="sm" variant="outline" onClick={() => toggleActive(p)}>
                  {p.isActive ? "إيقاف" : "تفعيل"}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {!isLoading && (plans ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد خطط بعد — أنشئ أول خطة.</p>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">{editing ? `تعديل خطة «${editing.nameAr}»` : "خطة جديدة"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الكود *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} dir="ltr" placeholder="basic / pro / enterprise" disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label>الاسم بالعربية *</Label>
                <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="الخطة الأساسية" />
              </div>
              <div className="space-y-1.5">
                <Label>الاسم بالإنجليزية</Label>
                <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>السعر الشهري</Label>
                <Input value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })} dir="ltr" type="number" min="0" />
              </div>
              <div className="space-y-1.5">
                <Label>العملة</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>أقصى مستخدمين</Label>
                <Input value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} dir="ltr" type="number" min="0" placeholder="فارغ = غير محدود" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>الوصف</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.whatsappEnabled} onChange={(e) => setForm({ ...form, whatsappEnabled: e.target.checked })} />
                تفعيل تكامل واتساب في هذه الخطة
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
              <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "إنشاء الخطة"}</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
