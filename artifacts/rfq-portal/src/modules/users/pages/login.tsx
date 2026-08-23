import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { APP_REALM, setSessionToken } from "@/lib/realm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Languages } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { firstAccessiblePath } from "@/lib/permissions";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { t, lang, setLang } = useLanguage();

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        // Cross-origin deployments authenticate with the session id as a
        // bearer token (third-party cookies are blocked), so persist it.
        const token = (data as { token?: string } | undefined)?.token ?? null;
        if (token) setSessionToken(token);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        // Land on the first page the employee is permitted to view (instead of
        // always /dashboard, which blanks for users without that permission).
        const emp = data?.employee;
        const target = firstAccessiblePath(emp?.role, emp?.permissions) ?? "/no-access";
        navigate(target);
      },
      onError: (err) => {
        const status = (err as { status?: number })?.status;
        if (status === 429) {
          setError(t("login.tooManyAttempts"));
        } else {
          // Surface the server's message (tenant pending/rejected/suspended,
          // realm isolation) instead of a generic "login failed".
          const serverMsg = (err as { data?: { error?: string } })?.data?.error;
          setError(serverMsg && status !== 401 ? serverMsg : t("login.error"));
        }
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
          >
            <Languages size={13} />
            {t("lang.toggle")}
          </button>
        </div>
        <div className="text-center mb-8">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
            <span className="text-white font-extrabold text-4xl leading-none">ت</span>
          </div>
          {APP_REALM === "admin" ? (
            <>
              <h1 className="text-2xl font-bold text-foreground">لوحة إدارة المنصة</h1>
              <p className="text-muted-foreground text-sm mt-1">مخصصة لفريق إدارة المنصة فقط</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground">{t("login.title")}</h1>
              <p className="text-muted-foreground text-sm mt-1">{t("login.subtitle")}</p>
              {t("login.address") ? <p className="text-muted-foreground text-xs mt-1">{t("login.address")}</p> : null}
              <p className="text-muted-foreground text-sm mt-3">{t("login.signIn")}</p>
            </>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-3 py-2 rounded">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? t("login.signingIn") : t("login.button")}
            </Button>

            {APP_REALM !== "admin" && (
              <p className="text-center text-sm text-muted-foreground">
                شركة جديدة؟{" "}
                <Link href="/signup">
                  <a className="text-primary hover:underline">سجّل شركتك الآن</a>
                </Link>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
