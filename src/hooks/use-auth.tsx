"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  isAccountRole,
  type AccountRole,
} from "@/lib/auth/roles";

/** Minimal user shape — replaces Supabase User */
export type AuthUser = {
  id: string;
  email: string;
  user_metadata?: { full_name?: string };
  created_at?: string;
};

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
  beta_features: string[];
  account_id: string | null;
  account_role: AccountRole | null;
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setProfileLoading(true);
    try {
      // Refresh access JWT if needed
      await fetch("/api/auth/refresh", { method: "POST" }).catch(() => null);

      const res = await fetch("/api/session/context");
      if (res.status === 401) {
        setUser(null);
        setProfile(null);
        setAccount(null);
        return;
      }
      if (!res.ok) return;
      const ctx = await res.json();
      if (!ctx.user?.id) {
        setUser(null);
        setProfile(null);
        setAccount(null);
        return;
      }

      setUser({
        id: ctx.user.id,
        email: ctx.user.email,
        user_metadata: { full_name: ctx.user.fullName ?? undefined },
      });

      const role =
        ctx.accountRole && isAccountRole(ctx.accountRole)
          ? ctx.accountRole
          : null;

      setProfile({
        id: ctx.user.id,
        full_name: ctx.user.fullName,
        email: ctx.user.email,
        avatar_url: ctx.user.avatarUrl,
        role: null,
        beta_features: [],
        account_id: ctx.workspace?.id ?? null,
        account_role: role,
      });

      if (ctx.workspace?.id) {
        setAccount({
          id: ctx.workspace.id,
          name: ctx.workspace.name,
          default_currency: DEFAULT_CURRENCY,
        });
      } else {
        setAccount(null);
      }
    } catch (err) {
      console.error("[AuthProvider]", err);
    } finally {
      setLoading(false);
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setProfile(null);
    setAccount(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const accountRole = profile?.account_role ?? null;
    return {
      user,
      profile,
      loading,
      profileLoading,
      signOut,
      refreshProfile: loadSession,
      accountId: profile?.account_id ?? null,
      accountRole,
      account,
      defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
      isOwner: accountRole === "owner",
      isAdmin: accountRole === "admin",
      isAgent: accountRole === "agent",
      isViewer: accountRole === "viewer",
      canManageMembers: canManageMembersFor(accountRole),
      canEditSettings: canEditSettingsFor(accountRole),
      canSendMessages: canSendMessagesFor(accountRole),
    };
  }, [user, profile, account, loading, profileLoading, signOut, loadSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
