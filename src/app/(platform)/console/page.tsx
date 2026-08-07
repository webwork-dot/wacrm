'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ux/page-header';
import { EmptyGuide } from '@/components/ux/empty-guide';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ConsoleDashboardPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void fetch('/api/admin/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const accounts = Number(health?.accounts ?? 0);
  const suspended = Number(health?.suspended ?? 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Is Convexa healthy for your customers?"
        nextStep={
          accounts === 0
            ? 'Add or wait for your first client workspace'
            : suspended > 0
              ? 'Review suspended clients'
              : 'Check clients that need attention'
        }
        action={
          <Link
            href="/console/clients"
            className={cn(buttonVariants({ variant: 'default' }))}
          >
            Manage clients
          </Link>
        }
      />

      {!health ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      ) : accounts === 0 ? (
        <EmptyGuide
          title="No clients yet"
          description="When businesses sign up, they appear here. You manage Convexa — they manage their workspace."
          steps={[
            { label: 'Open Clients', href: '/console/clients' },
            { label: 'Review system settings', href: '/console/settings' },
          ]}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clients
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{accounts}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Suspended
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{suspended}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Usage events
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {health.usage_events == null ? '—' : String(health.usage_events)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Billing
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Coming later
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">System status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            Platform operators:{' '}
            {(health?.env as { platform_admin_configured?: boolean })
              ?.platform_admin_configured
              ? 'Configured'
              : 'Set PLATFORM_ADMIN_EMAILS'}
          </p>
          <p>
            Background jobs:{' '}
            {(health?.env as { cron_configured?: boolean })?.cron_configured
              ? 'Configured'
              : 'Unknown'}
          </p>
          <p>Workers / queue / realtime: Unknown until monitoring wave</p>
        </CardContent>
      </Card>
    </div>
  );
}
