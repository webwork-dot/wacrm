'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function EmptyGuide({
  title,
  description,
  steps,
}: {
  title: string;
  description: string;
  steps: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <ol className="mt-6 space-y-2 text-left text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-muted-foreground">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {i + 1}
            </span>
            {s.href ? (
              <Link href={s.href} className="text-foreground underline-offset-4 hover:underline">
                {s.label}
              </Link>
            ) : (
              <span>{s.label}</span>
            )}
          </li>
        ))}
      </ol>
      {steps[0]?.href && (
        <Link
          href={steps[0].href}
          className={cn(buttonVariants({ variant: 'default' }), 'mt-8')}
        >
          {steps[0].label}
        </Link>
      )}
    </div>
  );
}
