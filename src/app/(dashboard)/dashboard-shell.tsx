"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SessionProvider, useSession } from "@/hooks/use-session";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import {
  WorkspaceChrome,
  AccountSwitcher,
} from "@/components/platform/platform-shell";
import { installCommandHook } from "@/lib/nav/commands";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const {
    loading: sessionLoading,
    surface,
    platformUser,
    impersonation,
  } = useSession();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Platform operators land in console unless View As Client is active.
  useEffect(() => {
    if (sessionLoading || authLoading) return;
    if (platformUser && surface === "platform" && !impersonation) {
      router.replace("/console");
    }
  }, [
    sessionLoading,
    authLoading,
    platformUser,
    surface,
    impersonation,
    router,
  ]);

  useEffect(() => installCommandHook(), []);

  if (authLoading || sessionLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (platformUser && surface === "platform" && !impersonation) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <WorkspaceChrome />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PresenceHeartbeat />
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onOpenSidebar={() => setSidebarOpen(true)} />
          {platformUser && !impersonation ? (
            <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-1">
              <AccountSwitcher />
            </div>
          ) : null}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SessionProvider>
        <DashboardShellInner>{children}</DashboardShellInner>
      </SessionProvider>
    </AuthProvider>
  );
}
