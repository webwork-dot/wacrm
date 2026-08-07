"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsersRound } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    let destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    if (!inviteToken) {
      try {
        const ctx = await fetch("/api/session/context").then((r) => r.json());
        if (ctx.surface === "platform") destination = "/console";
      } catch {
        /* fall through */
      }
    }
    window.location.href = destination;
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Left panel ─ hero / marketing ── */}
      <div
        className="relative hidden lg:flex lg:w-1/2 flex-col overflow-hidden"
        style={{ background: "#f0ede8" }}
      >
        {/* logo */}
        <div className="relative z-10 p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Convexa" style={{ height: 40, width: "auto" }} />
        </div>

        {/* hero content */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-10 pb-10 text-center">
          {/* image fills most of the panel height */}
          <div className="w-full flex-1 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/welcome.png"
              alt="Convexa – WhatsApp Business Platform"
              className="h-full w-auto object-contain"
              style={{ maxHeight: "60vh" }}
            />
          </div>

          <h1 className="mb-2 text-2xl font-bold leading-tight text-gray-900">
            Grow your business on{" "}
            <span
              style={{
                background: "linear-gradient(90deg,#25d366,#128c7e)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              WhatsApp
            </span>
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-gray-500">
            Send campaigns, automate replies, manage contacts, and track
            everything — all in one place.
          </p>
        </div>
      </div>

      {/* ── Right panel ─ login form ── */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-white px-8 py-12">
        {/* mobile logo */}
        <div className="mb-8 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Convexa" style={{ height: 40, width: "auto" }} />
        </div>

        <div className="w-full max-w-[360px]">
          {inviteToken ? (
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <UsersRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {t("titleAccept")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("descAccept")}</p>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Welcome back
              </p>
              <h2 className="text-2xl font-bold text-gray-900">Sign in to Convexa</h2>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                {t("emailLabel")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  {t("passwordLabel")}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline underline-offset-4"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 w-full text-sm font-semibold"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t("signingIn")}
                </span>
              ) : (
                t("signIn")
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            {t("noAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              {t("createAccount")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
