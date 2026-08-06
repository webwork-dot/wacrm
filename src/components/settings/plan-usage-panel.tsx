'use client';

import { useEffect, useState } from 'react';
import { Loader2, Gauge } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

interface UsagePayload {
  period_start: string;
  counters: Record<string, number>;
  status: string;
  plan: {
    name: string;
    slug: string;
    limits: Record<string, number | null>;
    entitlements: Record<string, boolean>;
  } | null;
}

const LABELS: Record<string, string> = {
  'message.outbound': 'Outbound messages',
  'broadcast.recipient': 'Broadcast recipients',
  'automation.run': 'Automation runs',
  'flow.run': 'Flow runs',
  'ai.draft': 'AI drafts',
  'ai.auto_reply': 'AI auto-replies',
  'api.request': 'API requests',
};

export function PlanUsagePanel() {
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/account/usage')
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? 'Failed to load usage');
        setData(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <SettingsPanelHead
        title="Plan & usage"
        description="Your software plan and this month’s Convexa usage. Meta and LLM bills stay with your providers."
      />

      {loading && (
        <div className="flex items-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4 text-primary" />
                {data.plan?.name ?? 'No plan assigned'}
              </CardTitle>
              <CardDescription>
                Status: {data.status}
                {data.plan ? ` · ${data.plan.slug}` : ''}
                {' · '}
                Period from {new Date(data.period_start).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {data.plan?.entitlements && (
                <p>
                  Includes:{' '}
                  {Object.entries(data.plan.entitlements)
                    .filter(([, on]) => on)
                    .map(([k]) => k)
                    .join(', ') || '—'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">This month</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {Object.entries(LABELS).map(([key, label]) => {
                  const used = data.counters[key] ?? 0;
                  const limitKey =
                    key === 'message.outbound'
                      ? 'messages_outbound_monthly'
                      : key === 'broadcast.recipient'
                        ? 'broadcast_recipients_monthly'
                        : key === 'automation.run' || key === 'flow.run'
                          ? 'automation_runs_monthly'
                          : key.startsWith('ai.')
                            ? 'ai_calls_monthly'
                            : null;
                  const limit =
                    limitKey && data.plan
                      ? data.plan.limits[limitKey]
                      : undefined;
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
                    >
                      <span>{label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {used}
                        {limit != null ? ` / ${limit}` : limit === null ? ' / ∞' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
