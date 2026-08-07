'use client';

import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  nextStep,
  action,
}: {
  title: string;
  description?: string;
  /** Answers "What should I do next?" */
  nextStep?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        {nextStep && (
          <p className="mt-2 text-sm font-medium text-foreground">
            Next: {nextStep}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
