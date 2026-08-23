import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { platformApi } from "@/lib/platform-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Building2 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "نشطة",
  suspended: "معلّقة",
  pending: "قيد المراجعة",
  rejected: "مرفوضة",
};

const SUB_STATUS: Record<string, string> = {
  active: "نشط",
  trialing: "تجريبي",
  past_due: "متأخر السداد",
  canceled: "ملغي",
  expired: "منتهي",
};

export default function AdminTenantsPage() {
  const { employee } = useAuth();
  const isSuperadmin = employee?.role === "superadmin";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    slug: "",
    contactEmail: "",
    contactPhone: "",
    notes: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/platform/tenants"],
    queryFn: platformApi.listTenants,
    enabled: isSuperadmin,
  });

  if (!isSuperadmin) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">غير مصرح — هذه الصفحة لمسؤول المنصة فقط.</div>
      </Layout>
    );
  }

  const tenants = data ?? [];
  const pendingCount = tenants.filter((t) => t.status === "pending").length;
  const filtered = tenants.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(s) ||
        t.slug.toLowerCase().includes(s) ||
        (t.contactEmail ?? "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  const create = async () => {
    if (!form.name.trim()) {
      toast.error("اسم الشركة مطلوب");
      return;
    }
    const hasAdmin = form.adminName.trim() && form.adminEmail.trim() && form.adminPassword;
    if (hasAdmin && form.adminPassword.length < 8) {
      toast.error("كلمة مرور المدير يجب ألا تقل عن 8 أحرف");
      return;
    }
    setSaving(true);
    try {
      const created = await platformApi.createTenant({
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || null,
        slug: form.slug.trim() || undefined,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        notes: form.notes.trim() || null,
        admin: hasAdmin
          ? { name: form.adminName.trim(), email: form.adminEmail.trim(), password: form.adminPassword }
          : null,
      });
      toast.success(
        created.adminEmployee
          ? `تم إنشاء الشركة «${created.name}» وحساب المدير ${created.adminEmployee.email}`
          : `تم إنشاء الشركة «${created.name}»`,
      );
      setShowCreate(false);
      setForm({
        name: "", nameEn: "", slug: "", contactEmail: "", contactPhone: "",
        notes: "", adminName: "", adminEmail: "", adminPassword: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: number, status: string, name: string) => {
    if (status === "rejected" && !window.confirm(`تأكيد رفض طلب تسجيل شركة «${name}»؟`)) return;
    try {
      await platformApi.updateTenant(id, { status: status as never });
      toast.success(
        status === "active"
          ? `تم اعتماد وتفعيل شركة «${name}» — يمكنها الآن تسجيل الدخول`
          : `تم تغيير حالة «${name}» إلى «${STATUS_LABEL[status] ?? status}»`,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">الشركات المشتركة</h1>
            <p className="text-sm text-muted-foreground mt-1">إدارة الشركات المشتركة في المنصة وحالاتها.</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} className="ml-1" /> شركة جديدة
          </Button>
        </div>

        {pendingCount > 0 && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              لديك <span className="font-bold">{pendingCount}</span> طلب تسجيل شركة جديدة بانتظار المراجعة والاعتماد.
            </p>
            <Button size="sm" variant="outline" onClick={() => setStatusFilter("pending")}>
              عرض الطلبات
            </Button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو slug أو البريد…"
              className="pr-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">كل الحالات</option>
            <option value="active">نشطة</option>
            <option value="pending">قيد المراجعة</option>
            <option value="suspended">معلّقة</option>
            <option value="rejected">مرفوضة</option>
          </select>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

        <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-right px-4 py-2 font-medium">الشركة</th>
                <th className="text-right px-4 py-2 font-medium">Slug</th>
                <th className="text-right px-4 py-2 font-medium">البريد</th>
                <th className="text-right px-4 py-2 font-medium">الاشتراك</th>
                <th className="text-right px-4 py-2 font-medium">الموظفون</th>
                <th className="text-right px-4 py-2 font-medium">واتساب</th>
                <th className="text-right px-4 py-2 font-medium">الحالة</th>
                <th className="text-right px-4 py-2 font-medium">إجراءات</th>
                <th className="text-right px-4 py-2 font-medium">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/tenants/${t.id}`}>
                      <a className="flex items-center gap-2 text-primary hover:underline font-medium">
                        <Building2 size={15} /> {t.name}
                      </a>
                    </Link>
                    {t.nameEn && <p className="text-xs text-muted-foreground mt-0.5">{t.nameEn}</p>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{t.contactEmail ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {t.subscription ? (
                      <div>
                        <p className="font-medium">{t.plan?.nameAr ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{SUB_STATUS[t.subscription.status] ?? t.subscription.status}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{t.employeeCount}</td>
                  <td className="px-4 py-2.5">
                    {t.whatsappConfigured ? (
                      <span className="text-emerald-600 font-medium">متصل ✓</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.status === "active"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : t.status === "pending"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      }`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5 flex-wrap">
                      {t.status !== "active" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "active", t.name)}>
                          اعتماد وتفعيل
                        </Button>
                      )}
                      {t.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "suspended", t.name)}>
                          تعليق
                        </Button>
                      )}
                      {t.status === "pending" && (
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => setStatus(t.id, "rejected", t.name)}>
                          رفض
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString("ar-EG")}
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    لا توجد شركات مطابقة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div
            className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold text-lg">شركة جديدة</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>اسم الشركة *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>الاسم بالإنجليزية</Label>
                <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Slug (اتركه فارغاً للتوليد التلقائي)</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>البريد الإلكتروني</Label>
                <Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>الهاتف</Label>
                <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>ملاحظات</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h3 className="font-bold text-sm mb-2">حساب مدير الشركة (اختياري)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>اسم المدير</Label>
                  <Input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>بريد المدير</Label>
                  <Input value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} dir="ltr" type="email" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>كلمة المرور</Label>
                  <Input value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} dir="ltr" type="password" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
              <Button onClick={create} disabled={saving}>{saving ? "جارٍ الإنشاء…" : "إنشاء الشركة"}</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
