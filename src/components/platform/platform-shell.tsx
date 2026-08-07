'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  LogOut,
  Bot,
  MessageSquare,
  Users,
  Radio,
  Workflow,
  GitBranch,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { installCommandHook } from '@/lib/nav/commands';

const ICONS: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  Bot,
  MessageSquare,
  Users,
  Radio,
  Workflow,
  GitBranch,
  Bell,
};

export function WorkspaceChrome() {
  const { surface, workspace, branding, impersonation } = useSession();

  // View As only — platform console does not show a workspace strip.
  if (impersonation) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
        <p className="font-medium text-amber-950 dark:text-amber-100">
          Viewing as <strong>{impersonation.accountName}</strong>
        </p>
        <button
          type="button"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          onClick={async () => {
            await fetch('/api/platform/impersonate', { method: 'DELETE' });
            window.location.href = '/console';
          }}
        >
          Exit Client View
        </button>
      </div>
    );
  }

  if (surface === 'platform') {
    return null;
  }

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
      Current workspace ·{' '}
      <span className="font-medium text-foreground">
        {branding?.name || workspace?.name || 'Workspace'}
      </span>
      {workspace?.planName ? ` · ${workspace.planName}` : ''}
      {workspace?.status ? (
        <span className="ml-1 capitalize">· {workspace.status}</span>
      ) : null}
    </div>
  );
}

export function AppNavSidebar({
  surface,
}: {
  surface: 'platform' | 'client';
}) {
  const { nav, branding } = useSession();
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card">
      <div className="relative shrink-0 border-b border-border">
        <Link
          href={surface === 'platform' ? '/console' : '/dashboard'}
          className="block w-full"
          aria-label={surface === 'platform' ? 'Convexa' : branding?.name || 'Workspace'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset from /public */}
          <img
            src={
              surface === 'client' && branding?.logoUrl
                ? branding.logoUrl
                : '/logo.png'
            }
            alt={surface === 'platform' ? 'Convexa' : branding?.name || 'Workspace'}
            className="block object-contain"
            style={{ width: 'auto', margin: '10px auto', height: 50 }}
          />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active =
            pathname === item.href ||
            (item.href !== '/console' &&
              item.href !== '/dashboard' &&
              pathname.startsWith(item.href));
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {surface === 'client' && (
        <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          Powered by Convexa
        </p>
      )}
    </aside>
  );
}

export function AccountSwitcher() {
  const { platformUser, switchableAccounts, impersonation } = useSession();
  const [busy, setBusy] = useState(false);
  if (!platformUser || switchableAccounts.length === 0) return null;

  return (
    <Select
      disabled={busy}
      onValueChange={async (accountId) => {
        setBusy(true);
        try {
          await fetch('/api/platform/impersonate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId }),
          });
          window.location.href = '/dashboard';
        } finally {
          setBusy(false);
        }
      }}
    >
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue
          placeholder={
            impersonation ? impersonation.accountName : 'Switch workspace'
          }
        />
      </SelectTrigger>
      <SelectContent>
        {switchableAccounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const { loading, surface, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && surface !== 'platform') {
      router.replace('/dashboard');
    }
  }, [loading, surface, router]);

  useEffect(() => installCommandHook(), []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (surface !== 'platform') {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <WorkspaceChrome />
      <div className="flex min-h-0 flex-1">
        <AppNavSidebar surface="platform" />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center justify-between border-b border-border px-4">
            <p className="text-sm font-medium text-foreground">Platform Console</p>
            <div className="flex items-center gap-2">
              <AccountSwitcher />
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {user?.email}
              </span>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                onClick={async (e) => {
                  e.preventDefault();
                  const { createClient } = await import('@/lib/supabase/client');
                  await createClient().auth.signOut();
                  window.location.href = '/login';
                }}
              >
                <LogOut className="h-4 w-4" />
              </Link>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
