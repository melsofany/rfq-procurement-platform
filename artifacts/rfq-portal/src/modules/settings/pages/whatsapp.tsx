import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { settingsApi } from "@/lib/platform-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Info } from "lucide-react";

/**
 * WhatsApp tab — the company admin enters their own Meta (WhatsApp Business
 * Cloud) credentials so the company's RFQs/POs and the rep bot run on the
 * company's own WhatsApp number. Rendered as a tab inside /settings (no
 * Layout — the parent page supplies it).
 */
export default function WhatsappTab() {
  const { employee } = useAuth();
  const canEdit = employee?.role === "admin" || employee?.role === "manager" || employee?.role === "superadmin";
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/settings/whatsapp"],
    queryFn: settingsApi.getWhatsapp,
    enabled: canEdit,
  });

  const [form, setForm] = useState({
    phoneNumberId: "",
    wabaId: "",
    displayPhone: "",
    accessToken: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm((f) => ({
        ...f,
        phoneNumberId: data.phoneNumberId ?? "",
        wabaId: data.wabaId ?? "",
        displayPhone: data.displayPhone ?? "",
        // Secrets are never echoed back — keep blank; blank means "keep current".
        accessToken: "",
      }));
    }
  }, [data]);

  if (!canEdit) {
    return <div className="p-6 text-center text-muted-foreground">غير مصرح — إعدادات واتساب لمدير الشركة فقط.</div>;
  }

  const save = async () => {
    setSaving(true);
    try {
      await settingsApi.saveWhatsapp({
        phoneNumberId: form.phoneNumberId.trim() || null,
        wabaId: form.wabaId.trim() || null,
        displayPhone: form.displayPhone.trim() || null,
        accessToken: form.accessToken.trim() || null,
        enabled: Boolean(form.phoneNumberId.trim()),
      });
      toast.success("تم حفظ إعدادات واتساب");
      setForm((f) => ({ ...f, accessToken: "" }));
      queryClient.invalidateQueries({ queryKey: ["/api/settings/whatsapp"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
      <div className="space-y-5 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          اربط رقم واتساب للأعمال الخاص بشركتك (WhatsApp Business Cloud API) — كل الرسائل والإشعارات وبوت المندوبين ستعمل من رقم شركتك.
        </p>

        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm flex gap-2">
          <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">خطوات الربط:</p>
            <ol className="list-decimal pr-4 space-y-1 text-muted-foreground">
              <li>أنشئ تطبيقاً على <span dir="ltr">developers.facebook.com</span> وفعّل منتج WhatsApp.</li>
              <li>انسخ <span dir="ltr">Phone Number ID</span> و<span dir="ltr">Business Account ID</span> و<span dir="ltr">Access Token</span> (دائم) من لوحة Meta.</li>
              <li>اضبط رابط الـ Webhook في Meta على: <span dir="ltr" className="font-mono text-xs">{`${window.location.origin}/api/whatsapp/webhook`}</span></li>
              <li>رمز التحقق (Verify Token) المطلوب في Meta: القيمة المعرفة لدى مسؤول المنصة.</li>
            </ol>
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

        {data && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>رقم الهاتف المعروض</Label>
              <Input value={form.displayPhone} onChange={(e) => setForm({ ...form, displayPhone: e.target.value })} dir="ltr" placeholder="+2010XXXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number ID *</Label>
              <Input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} dir="ltr" placeholder="123456789012345" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp Business Account ID</Label>
              <Input value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>
                Access Token {data.accessTokenMasked && <span className="text-xs text-emerald-600">(محفوظ {data.accessTokenMasked} — اتركه فارغاً للإبقاء عليه)</span>}
              </Label>
              <Input type="password" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} dir="ltr" placeholder="EAA…" />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</Button>
              {data.enabled && data.accessTokenMasked && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">واتساب متصل ✓</span>
              )}
            </div>
          </div>
        )}
      </div>
  );
}
