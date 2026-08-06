'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Activity, Users, Ban } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function AdminOverviewPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/admin/health')
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Failed');
        setHealth(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!health) {
    return (
      <div className="flex items-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading health…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          Software-only ops: clients, plans, usage. Meta/AI billing stays with
          the client.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {String(health.accounts ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="h-4 w-4" /> Suspended
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {String(health.suspended ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Usage events
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {health.usage_events == null ? '—' : String(health.usage_events)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment</CardTitle>
          <CardDescription>
            PLATFORM_ADMIN_EMAILS and cron must be set for full ops.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            Platform admin allowlist:{' '}
            {(health.env as { platform_admin_configured?: boolean })
              ?.platform_admin_configured
              ? 'configured'
              : 'missing'}
          </p>
          <p>
            Cron secret:{' '}
            {(health.env as { cron_configured?: boolean })?.cron_configured
              ? 'configured'
              : 'missing'}
          </p>
          <p className="pt-2">
            <Link href="/admin/clients" className="text-primary underline">
              Manage clients →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
