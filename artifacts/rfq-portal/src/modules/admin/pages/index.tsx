import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { platformApi } from "@/lib/platform-api";
import { Building2, CheckCircle2, Clock, PauseCircle, CreditCard, FlaskConical } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "نشطة",
  suspended: "معلّقة",
  pending: "قيد التفعيل",
};

export default function AdminDashboardPage() {
  const { employee } = useAuth();
  const isSuperadmin = employee?.role === "superadmin";

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/platform/stats"],
    queryFn: platformApi.stats,
    enabled: isSuperadmin,
  });

  if (!isSuperadmin) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">غير مصرح — هذه الصفحة لمسؤول المنصة فقط.</div>
      </Layout>
    );
  }

  const cards = [
    { label: "إجمالي الشركات", value: data?.tenants.total, icon: Building2, cls: "from-blue-500 to-indigo-600" },
    { label: "شركات نشطة", value: data?.tenants.active, icon: CheckCircle2, cls: "from-emerald-500 to-teal-600" },
    { label: "قيد التفعيل", value: data?.tenants.pending, icon: Clock, cls: "from-amber-500 to-orange-600" },
    { label: "معلّقة", value: data?.tenants.suspended, icon: PauseCircle, cls: "from-red-500 to-rose-600" },
    { label: "اشتراكات نشطة", value: data?.subscriptions.active, icon: CreditCard, cls: "from-violet-500 to-purple-600" },
    { label: "فترة تجريبية", value: data?.subscriptions.trial, icon: FlaskConical, cls: "from-cyan-500 to-sky-600" },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">لوحة إدارة المنصة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            نظرة عامة على الشركات المشتركة والاشتراكات.
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {cards.map((c) => (
            <div key={c.label} className={`rounded-xl bg-gradient-to-br ${c.cls} text-white p-4 shadow`}>
              <c.icon size={22} className="opacity-80" />
              <p className="text-2xl font-extrabold mt-2">{c.value ?? "—"}</p>
              <p className="text-xs opacity-90 mt-1">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-sm">أحدث الشركات</h2>
            <Link href="/admin/tenants">
              <a className="text-xs text-primary hover:underline">كل الشركات ←</a>
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-right px-4 py-2 font-medium">الشركة</th>
                <th className="text-right px-4 py-2 font-medium">الحالة</th>
                <th className="text-right px-4 py-2 font-medium">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentTenants ?? []).map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/admin/tenants/${t.id}`}>
                      <a className="text-primary hover:underline font-medium">{t.name}</a>
                    </Link>
                  </td>
                  <td className="px-4 py-2">{STATUS_LABEL[t.status] ?? t.status}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString("ar-EG")}
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.recentTenants ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    لا توجد شركات بعد — أضف أول شركة من صفحة «الشركات».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
