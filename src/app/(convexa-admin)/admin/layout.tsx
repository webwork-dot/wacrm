import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/account";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Convexa Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePlatformAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ForbiddenError) redirect("/dashboard");
    redirect("/dashboard");
  }

  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/clients", label: "Clients" },
    { href: "/admin/plans", label: "Plans" },
    { href: "/admin/usage", label: "Usage" },
    { href: "/admin/settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hidden · Convexa Admin
            </p>
            <h1 className="text-lg font-semibold">Platform console</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Client portal
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
