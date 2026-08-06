'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Package, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface KitSummary {
  slug: string;
  name: string;
  description: string;
  industry: string;
  tags: string[];
  includes: {
    flow: boolean;
    automation: boolean;
    knowledge: number;
    ai_profile: boolean;
  };
}

export default function StarterKitsPage() {
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/starter-kits');
        const data = await res.json();
        if (!cancelled && res.ok) setKits(data.kits ?? []);
        else if (!cancelled) toast.error(data.error ?? 'Failed to load kits');
      } catch {
        if (!cancelled) toast.error('Failed to load kits');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async (slug: string) => {
    setInstalling(slug);
    try {
      const res = await fetch('/api/starter-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Install failed');
        return;
      }
      toast.success(`Installed “${slug}”`);
      if (data.hint) toast.message(data.hint);
    } catch {
      toast.error('Install failed');
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <Package className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Starter Kits</h1>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Industry packs that install draft automations, Knowledge Hub docs, and
        an AI Studio persona. Not a marketplace — curated for DIY setup.
      </p>

      {loading ? (
        <div className="flex items-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kits.map((kit) => (
            <Card key={kit.slug}>
              <CardHeader className="pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {kit.industry}
                </p>
                <CardTitle className="text-base">{kit.name}</CardTitle>
                <CardDescription>{kit.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {kit.includes.flow && (
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary" /> Automation
                      Studio flow
                    </li>
                  )}
                  {kit.includes.automation && (
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary" /> Legacy
                      automation draft
                    </li>
                  )}
                  {kit.includes.knowledge > 0 && (
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary" />{' '}
                      {kit.includes.knowledge} knowledge doc
                      {kit.includes.knowledge === 1 ? '' : 's'}
                    </li>
                  )}
                  {kit.includes.ai_profile && (
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary" /> AI Studio
                      persona
                    </li>
                  )}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={installing === kit.slug}
                    onClick={() => void install(kit.slug)}
                  >
                    {installing === kit.slug && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Install
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/flows">Open flows</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
