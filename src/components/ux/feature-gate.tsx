'use client';

import Link from 'next/link';
import { useSession } from '@/hooks/use-session';
import { isFeatureEnabled } from '@/lib/auth/feature-gates';
import { EmptyGuide } from '@/components/ux/empty-guide';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Gates a module by feature flag × plan entitlement.
 * Shows a teaching empty state instead of a dead end.
 */
export function FeatureGate({
  featureFlag,
  planEntitlement,
  children,
  title = 'This feature is not available',
  description = 'Your plan or workspace settings do not include this module yet.',
}: {
  featureFlag?: string;
  planEntitlement?: string;
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { featureFlags, planEntitlements, loading } = useSession();

  if (loading) {
    return (
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    );
  }

  if (
    !isFeatureEnabled(featureFlags, planEntitlements, {
      featureFlag,
      planEntitlement,
    })
  ) {
    return (
      <EmptyGuide
        title={title}
        description={description}
        steps={[
          { label: 'Review your plan in Settings', href: '/settings' },
          { label: 'Back to Dashboard', href: '/dashboard' },
        ]}
      />
    );
  }

  return <>{children}</>;
}

export function OnboardingChecklistCard() {
  const { onboarding, health } = useSession();
  if (!onboarding || onboarding.complete) return null;

  const next = onboarding.steps.find((s) => !s.done);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Get set up · {onboarding.progress}%
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {health?.level === 'critical'
              ? 'Finish setup so customers can reach you.'
              : 'A few steps left to unlock the full workspace.'}
          </p>
        </div>
        {next ? (
          <Link
            href={next.href}
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            {next.title}
          </Link>
        ) : null}
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {onboarding.steps.map((s) => (
          <li
            key={s.id}
            className={cn(
              'text-xs',
              s.done ? 'text-muted-foreground line-through' : 'text-foreground',
            )}
          >
            {s.done ? '✓ ' : '○ '}
            {s.href && !s.done ? (
              <Link href={s.href} className="underline-offset-4 hover:underline">
                {s.title}
              </Link>
            ) : (
              s.title
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
