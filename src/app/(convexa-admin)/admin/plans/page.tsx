'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  limits: Record<string, number | null>;
  entitlements: Record<string, boolean>;
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch('/api/admin/plans')
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Software plans</h2>
        <p className="text-sm text-muted-foreground">
          Catalog for manual assignment. Soft monthly caps only — not Meta or
          LLM billing.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
              <CardDescription>
                <span className="font-mono text-xs">{p.slug}</span>
                {p.description ? ` — ${p.description}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Limits</p>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(p.limits ?? {}).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v == null ? 'unlimited' : v}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Entitlements</p>
                <p>
                  {Object.entries(p.entitlements ?? {})
                    .filter(([, on]) => on)
                    .map(([k]) => k)
                    .join(', ') || '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
