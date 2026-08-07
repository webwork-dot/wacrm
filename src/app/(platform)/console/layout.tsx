import type { Metadata } from 'next';
import { PlatformShellClient } from './platform-shell-client';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: 'Convexa Console',
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlatformShellClient>{children}</PlatformShellClient>;
}
