'use client';

import { AuthProvider } from '@/hooks/use-auth';
import { SessionProvider } from '@/hooks/use-session';
import { PlatformShell } from '@/components/platform/platform-shell';

export function PlatformShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <SessionProvider>
        <PlatformShell>{children}</PlatformShell>
      </SessionProvider>
    </AuthProvider>
  );
}
