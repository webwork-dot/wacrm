"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, ArrowLeft } from "lucide-react";

function LeftPanel() {
  return (
    <div
      className="relative hidden lg:flex lg:w-1/2 flex-col overflow-hidden"
      style={{ background: "#f0ede8" }}
    >
      <div className="relative z-10 p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Convexa" style={{ height: 40, width: "auto" }} />
      </div>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-10 pb-10 text-center">
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
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-screen bg-background">
        <LeftPanel />
        <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-white px-8 py-12">
          <div className="w-full max-w-[360px] text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <CheckCircle className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Check your email</h2>
            <p className="mt-2 text-sm text-gray-500">
              We&apos;ve sent a password reset link to{" "}
              <span className="font-medium text-gray-900">{email}</span>. Please check
              your inbox.
            </p>
            <Link href="/login" className="mt-8 block">
              <Button variant="outline" className="w-full h-11">
                Back to sign in
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <LeftPanel />

      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-white px-8 py-12">
        {/* mobile logo */}
        <div className="mb-8 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Convexa" style={{ height: 40, width: "auto" }} />
        </div>

        <div className="w-full max-w-[360px]">
          <div className="mb-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Account recovery
            </p>
            <h2 className="text-2xl font-bold text-gray-900">Reset password</h2>
            <p className="mt-1 text-sm text-gray-500">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <form onSubmit={handleReset} className="flex flex-col gap-5">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  Sending...
                </span>
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
