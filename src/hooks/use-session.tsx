'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { can, type Permission } from '@/lib/auth/permissions';

export interface SessionContextValue {
  loading: boolean;
  surface: 'platform' | 'client';
  platformUser: {
    userId: string;
    email: string;
    platformRole: string;
  } | null;
  workspace: {
    id: string;
    name: string;
    status: string;
    planSlug: string | null;
    planName: string | null;
  } | null;
  permissions: string[];
  featureFlags: Record<string, boolean>;
  planEntitlements: Record<string, boolean>;
  branding: { logoUrl: string | null; primaryColor: string | null; name: string } | null;
  impersonation: { accountId: string; accountName: string } | null;
  switchableAccounts: Array<{ id: string; name: string; status: string }>;
  nav: Array<{ id: string; href: string; label: string; icon: string }>;
  health: { level: string; score: number; reasons: string[] } | null;
  onboarding: {
    steps: Array<{ id: string; title: string; href: string; done: boolean }>;
    progress: number;
    complete: boolean;
  } | null;
  user: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  refresh: () => Promise<void>;
  can: (p: Permission | string) => boolean;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Omit<
    SessionContextValue,
    'loading' | 'refresh' | 'can'
  > | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/session/context');
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = await res.json();
      setData({
        surface: json.surface ?? 'client',
        platformUser: json.platformUser,
        workspace: json.workspace,
        permissions: json.permissions ?? [],
        featureFlags: json.featureFlags ?? {},
        planEntitlements: json.planEntitlements ?? {},
        branding: json.branding,
        impersonation: json.impersonation,
        switchableAccounts: json.switchableAccounts ?? [],
        nav: json.nav ?? [],
        health: json.health,
        onboarding: json.onboarding,
        user: json.user,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionContextValue>(() => {
    const permissions = data?.permissions ?? [];
    return {
      loading,
      surface: data?.surface ?? 'client',
      platformUser: data?.platformUser ?? null,
      workspace: data?.workspace ?? null,
      permissions,
      featureFlags: data?.featureFlags ?? {},
      planEntitlements: data?.planEntitlements ?? {},
      branding: data?.branding ?? null,
      impersonation: data?.impersonation ?? null,
      switchableAccounts: data?.switchableAccounts ?? [],
      nav: data?.nav ?? [],
      health: data?.health ?? null,
      onboarding: data?.onboarding ?? null,
      user: data?.user ?? null,
      refresh,
      can: (p) => can(permissions, p),
    };
  }, [data, loading, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
