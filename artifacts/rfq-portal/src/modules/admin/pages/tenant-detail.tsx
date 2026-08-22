import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { platformApi } from "@/lib/platform-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, Plus, KeyRound, MessageSquare } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "نشطة",
  suspended: "معلّقة",
  pending: "قيد التفعيل",
};

const SUB_STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  trialing: "تجريبي",
  past_due: "متأخر السداد",
  canceled: "ملغي",
  expired: "منتهي",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "مدير",
  manager: "مدير تشغيل",
  purchasing: "مشتريات",
  data_entry: "مدخل بيانات",
};

export default function AdminTenantDetailPage() {
  const { employee } = useAuth();
  const isSuperadmin = employee?.role === "superadmin";
  const params = useParams<{ id: string }>();
  const tenantId = parseInt(params.id ?? "0", 10);
  const queryClient = useQueryClient();

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ["/api/platform/tenants", tenantId],
    queryFn: () => platformApi.getTenant(tenantId),
    enabled: isSuperadmin && tenantId > 0,
  });

  const { data: plans } = useQuery({
    queryKey: ["/api/platform/plans"],
    queryFn: platformApi.listPlans,
    enabled: isSuperadmin,
  });

  const [savingInfo, setSavingInfo] = useState(false);
  const [info, setInfo] = useState<null | { name: string; nameEn: string; contactEmail: string; contactPhone: string; notes: string }>(null);
  const [showSubForm, setShowSubForm] = useState(false);
  const [subForm, setSubForm] = useState({ planId: "", endsAt: "", notes: "" });
  const [savingSub, setSavingSub] = useState(false);
  const [resetTarget, setResetTarget] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
    queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
  };

  if (!isSuperadmin) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">غير مصرح — هذه الصفحة لمسؤول المنصة فقط.</div>
      </Layout>
    );
  }

  const currentInfo = info ?? (tenant
    ? {
        name: tenant.name,
        nameEn: tenant.nameEn ?? "",
        contactEmail: tenant.contactEmail ?? "",
        contactPhone: tenant.contactPhone ?? "",
        notes: tenant.notes ?? "",
      }
    : null);

  const saveInfo = async () => {
    if (!currentInfo) return;
    setSavingInfo(true);
    try {
      await platformApi.updateTenant(tenantId, {
        name: currentInfo.name.trim() || undefined,
        nameEn: currentInfo.nameEn.trim() || null,
        contactEmail: currentInfo.contactEmail.trim() || null,
        contactPhone: currentInfo.contactPhone.trim() || null,
        notes: currentInfo.notes.trim() || null,
      });
      toast.success("تم حفظ بيانات الشركة");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingInfo(false);
    }
  };

  const setStatus = async (status: string) => {
    try {
      await platformApi.updateTenant(tenantId, { status: status as never });
      toast.success(`تم تغيير حالة الشركة إلى «${STATUS_LABEL[status] ?? status}»`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const createSub = async () => {
    if (!subForm.planId) {
      toast.error("اختر خطة الاشتراك");
      return;
    }
    setSavingSub(true);
    try {
      await platformApi.createSubscription(tenantId, {
        planId: parseInt(subForm.planId, 10),
        endsAt: subForm.endsAt || null,
        notes: subForm.notes.trim() || null,
      });
      toast.success("تم إنشاء الاشتراك وتفعيله");
      setShowSubForm(false);
      setSubForm({ planId: "", endsAt: "", notes: "" });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingSub(false);
    }
  };

  const updateSub = async (subId: number, body: Parameters<typeof platformApi.updateSubscription>[2]) => {
    try {
      await platformApi.updateSubscription(tenantId, subId, body);
      toast.success("تم تحديث الاشتراك");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget || newPassword.length < 8) {
      toast.error("كلمة المرور يجب ألا تقل عن 8 أحرف");
      return;
    }
    try {
      const r = await platformApi.resetTenantEmployeePassword(tenantId, resetTarget, newPassword);
      toast.success(`تمت إعادة تعيين كلمة مرور ${r.email}`);
      setResetTarget(null);
      setNewPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/tenants"><a className="flex items-center gap-1 hover:text-foreground"><ArrowRight size={14} /> الشركات</a></Link>
          <span>/</span>
          <span className="text-foreground font-medium">{tenant?.name ?? "…"}</span>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

        {tenant && currentInfo && (
          <>
            {/* ── Company info ─────────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold">بيانات الشركة</h2>
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    tenant.status === "active"
                      ? "bg-emerald-100 text-emerald-700"
                      : tenant.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}>
                    {STATUS_LABEL[tenant.status] ?? tenant.status}
                  </span>
                  {tenant.status !== "active" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus("active")}>تفعيل</Button>
                  )}
                  {tenant.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus("suspended")}>تعليق</Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>اسم الشركة</Label>
                  <Input value={currentInfo.name} onChange={(e) => setInfo({ ...currentInfo, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>الاسم بالإنجليزية</Label>
                  <Input value={currentInfo.nameEn} onChange={(e) => setInfo({ ...currentInfo, nameEn: e.target.value })} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label>البريد الإلكتروني</Label>
                  <Input value={currentInfo.contactEmail} onChange={(e) => setInfo({ ...currentInfo, contactEmail: e.target.value })} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label>الهاتف</Label>
                  <Input value={currentInfo.contactPhone} onChange={(e) => setInfo({ ...currentInfo, contactPhone: e.target.value })} dir="ltr" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>ملاحظات</Label>
                  <Input value={currentInfo.notes} onChange={(e) => setInfo({ ...currentInfo, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveInfo} disabled={savingInfo}>{savingInfo ? "جارٍ الحفظ…" : "حفظ البيانات"}</Button>
              </div>
            </div>

            {/* ── Subscriptions ────────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="font-bold">الاشتراكات</h2>
                <Button size="sm" onClick={() => setShowSubForm(true)}>
                  <Plus size={14} className="ml-1" /> اشتراك جديد
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-right px-4 py-2 font-medium">الخطة</th>
                    <th className="text-right px-4 py-2 font-medium">الحالة</th>
                    <th className="text-right px-4 py-2 font-medium">البداية</th>
                    <th className="text-right px-4 py-2 font-medium">الانتهاء</th>
                    <th className="text-right px-4 py-2 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.subscriptions.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-2.5 font-medium">{s.planName ?? `#${s.planId}`}</td>
                      <td className="px-4 py-2.5">{SUB_STATUS_LABEL[s.status] ?? s.status}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{new Date(s.startsAt).toLocaleDateString("ar-EG")}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {s.endsAt ? new Date(s.endsAt).toLocaleDateString("ar-EG") : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5 flex-wrap">
                          {s.status !== "active" && (
                            <Button size="sm" variant="outline" onClick={() => updateSub(s.id, { status: "active" })}>تفعيل</Button>
                          )}
                          {s.status === "active" && (
                            <Button size="sm" variant="outline" onClick={() => updateSub(s.id, { status: "past_due" })}>إيقاف مؤقت</Button>
                          )}
                          {(s.status === "active" || s.status === "trialing" || s.status === "past_due") && (
                            <Button size="sm" variant="outline" onClick={() => updateSub(s.id, { status: "canceled" })}>إلغاء</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tenant.subscriptions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        لا توجد اشتراكات — أنشئ اشتراكاً لتفعيل الخطة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── WhatsApp integration ─────────────────────────────────── */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-emerald-600" />
                <h2 className="font-bold">تكامل واتساب</h2>
              </div>
              {tenant.whatsapp?.configured ? (
                <div className="text-sm space-y-1">
                  <p>رقم العرض: <span className="font-mono">{tenant.whatsapp.displayPhone ?? "—"}</span></p>
                  <p>Phone Number ID: <span className="font-mono">{tenant.whatsapp.phoneNumberId ?? "—"}</span></p>
                  <p>Business Account ID: <span className="font-mono">{tenant.whatsapp.wabaId ?? "—"}</span></p>
                  <p>رمز الوصول: <span className="font-mono">{tenant.whatsapp.accessTokenMasked ?? "—"}</span></p>
                  <p>
                    الحالة:
                    <span className={`mr-1 px-2 py-0.5 rounded-full text-xs font-medium ${tenant.whatsapp.enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {tenant.whatsapp.enabled ? "متصل" : "موقوف"}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  لم يُضبط تكامل واتساب لهذه الشركة بعد — مدير الشركة يضبطه من «إعدادات واتساب» داخل حسابه.
                </p>
              )}
            </div>

            {/* ── Employees ────────────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-bold">موظفو الشركة</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-right px-4 py-2 font-medium">الاسم</th>
                    <th className="text-right px-4 py-2 font-medium">البريد</th>
                    <th className="text-right px-4 py-2 font-medium">الدور</th>
                    <th className="text-right px-4 py-2 font-medium">الحالة</th>
                    <th className="text-right px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.employees.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-4 py-2.5 font-medium">{e.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground" dir="ltr">{e.email}</td>
                      <td className="px-4 py-2.5">{ROLE_LABEL[e.role] ?? e.role}</td>
                      <td className="px-4 py-2.5">{e.isActive ? "نشط" : "موقوف"}</td>
                      <td className="px-4 py-2.5">
                        <Button size="sm" variant="outline" onClick={() => { setResetTarget(e.id); setNewPassword(""); }}>
                          <KeyRound size={13} className="ml-1" /> إعادة تعيين كلمة المرور
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {tenant.employees.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        لا يوجد موظفون بعد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Create subscription dialog ──────────────────────────────────── */}
      {showSubForm && tenant && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSubForm(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">اشتراك جديد — {tenant.name}</h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>الخطة *</Label>
                <select
                  value={subForm.planId}
                  onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">— اختر الخطة —</option>
                  {(plans ?? [])
                    .filter((p) => p.isActive)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr}{p.monthlyPrice != null ? ` — ${p.monthlyPrice} ${p.currency ?? "EGP"}/شهر` : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>تاريخ الانتهاء (اختياري)</Label>
                <Input type="date" value={subForm.endsAt} onChange={(e) => setSubForm({ ...subForm, endsAt: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>ملاحظات</Label>
                <Input value={subForm.notes} onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSubForm(false)}>إلغاء</Button>
              <Button onClick={createSub} disabled={savingSub}>{savingSub ? "جارٍ الإنشاء…" : "إنشاء الاشتراك"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset password dialog ───────────────────────────────────────── */}
      {resetTarget != null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setResetTarget(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">إعادة تعيين كلمة المرور</h2>
            <div className="space-y-1.5">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} dir="ltr" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetTarget(null)}>إلغاء</Button>
              <Button onClick={resetPassword}>تعيين</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
