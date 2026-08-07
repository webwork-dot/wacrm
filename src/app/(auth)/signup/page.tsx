"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, UsersRound } from "lucide-react";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

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

function SignupPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const emailRedirectTo = inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
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
              We&apos;ve sent a confirmation link to{" "}
              <span className="font-medium text-gray-900">{email}</span>. Click the
              link to verify your account.
            </p>
            <Link
              href={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login"}
              className="mt-8 block"
            >
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
          {inviteToken ? (
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <UsersRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Create account &amp; join</h2>
                <p className="text-sm text-gray-500">
                  Verify your email, then accept the invitation.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Get started
              </p>
              <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
            </div>
          )}

          <form onSubmit={handleSignup} className="flex flex-col gap-5">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">
                Full name
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="h-11 border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>

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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                Confirm password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
