'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Rocket,
  ArrowRight,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { OnboardingStatus } from '@/lib/platform/onboarding';
import { cn } from '@/lib/utils';

export default function OnboardingPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to load onboarding');
        return;
      }
      setStatus(data);
    } catch {
      toast.error('Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const markDone = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complete: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not complete');
        return;
      }
      if (data.warning) toast.message(data.warning);
      else toast.success('Onboarding marked complete');
      setStatus(data);
    } catch {
      toast.error('Could not complete');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !status) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  const next = status.steps.find((s) => !s.done);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <Rocket className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Get started</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect your Meta + AI keys, ground the agent, then install a Starter
        Kit. Progress: {status.progress}%
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${status.progress}%` }}
        />
      </div>

      {next && (
        <Card className="mt-6 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What next?</CardTitle>
            <CardDescription>{next.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={next.href}
              className={cn(buttonVariants({ variant: 'default' }))}
            >
              {next.title} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      <ul className="mt-6 space-y-3">
        {status.steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
          >
            {step.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
            {!step.done && (
              <Link
                href={step.href}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={saving || status.completed}
          onClick={() => void markDone()}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {status.completed ? 'Completed' : 'Mark onboarding complete'}
        </Button>
        <Link
          href="/starter-kits"
          className={cn(buttonVariants({ variant: 'ghost' }))}
        >
          Browse Starter Kits
        </Link>
      </div>
    </div>
  );
}
