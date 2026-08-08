"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UsersRound } from "lucide-react";

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

  return (
    <div className="flex min-h-screen bg-background">
      <LeftPanel />

      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-white px-8 py-12">
        <div className="mb-8 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Convexa" style={{ height: 40, width: "auto" }} />
        </div>

        <div className="w-full max-w-[360px] text-center">
          {inviteToken ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <UsersRound className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">You&apos;re invited</h2>
              <p className="mt-2 text-sm text-gray-500">
                Sign in with the account your administrator provisioned, then
                accept the invitation.
              </p>
              <Link
                href={`/login?invite=${encodeURIComponent(inviteToken)}`}
                className="mt-8 block"
              >
                <Button className="w-full h-11">Continue to sign in</Button>
              </Link>
              <Link
                href={`/join/${encodeURIComponent(inviteToken)}`}
                className="mt-3 block text-sm text-gray-500 underline"
              >
                Open invitation
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900">Accounts are provisioned</h2>
              <p className="mt-2 text-sm text-gray-500">
                Self-service signup is disabled. Ask your platform administrator
                to create your workspace user, then sign in.
              </p>
              <Link href="/login" className="mt-8 block">
                <Button className="w-full h-11">Back to sign in</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
