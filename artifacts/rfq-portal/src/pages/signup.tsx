import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Public company self-signup (no auth). Creates a PENDING tenant + its first
 * admin employee; a platform superadmin reviews and activates the account
 * from /admin/tenants. Until then, logins are blocked with a clear message.
 */
export default function SignupPage() {
  const [form, setForm] = useState({
    companyName: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "تعذر إرسال الطلب — حاول مرة أخرى");
        return;
      }
      setDone(true);
    } catch {
      setError("تعذر الاتصال بالخادم — تحقق من اتصالك وحاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Building2 className="text-white" size={30} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">تسجيل شركة جديدة</h1>
          <p className="text-muted-foreground text-sm mt-1">
            سجّل شركتك في منصة تسعير المشتريات — يُراجَع الطلب ويُفعَّل من إدارة المنصة
          </p>
        </div>

        {done ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
            <h2 className="text-lg font-bold">تم استلام طلبك بنجاح</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              حساب شركتك الآن <span className="font-semibold text-amber-600">قيد المراجعة</span> من
              إدارة المنصة. فور الاعتماد والتفعيل ستتمكن من تسجيل الدخول ببريدك الإلكتروني وكلمة
              المرور اللذين سجلت بهما.
            </p>
            <Link href="/login">
              <a className="inline-block">
                <Button variant="outline">العودة إلى تسجيل الدخول</Button>
              </a>
            </Link>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">اسم الشركة *</Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">اسم المسؤول *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">هاتف التواصل</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">البريد الإلكتروني (لتسجيل الدخول) *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@company.com"
                  dir="ltr"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">كلمة المرور *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">تأكيد كلمة المرور *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">ملاحظات (اختياري)</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="مجال العمل، عدد الموظفين…"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-3 py-2 rounded">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "جارٍ إرسال الطلب…" : "إرسال طلب التسجيل"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                لديك حساب بالفعل؟{" "}
                <Link href="/login">
                  <a className="text-primary hover:underline">تسجيل الدخول</a>
                </Link>
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
