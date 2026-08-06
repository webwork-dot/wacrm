/**
 * Platform admin gate — hidden Convexa Admin operators.
 *
 * Allowlist via PLATFORM_ADMIN_EMAILS (comma-separated). Not a tenant
 * role and never shown in the client portal sidebar.
 */

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  ForbiddenError,
  UnauthorizedError,
  type AccountContext,
} from "@/lib/auth/account";

export interface PlatformAdminContext {
  userId: string;
  email: string;
  /** Service-role client for cross-tenant reads/writes. */
  admin: ReturnType<typeof supabaseAdmin>;
  /** Caller's SSR client (RLS-scoped) when needed. */
  supabase: Awaited<ReturnType<typeof createClient>>;
}

function platformAdminEmails(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = platformAdminEmails();
  if (allow.size === 0) return false;
  return allow.has(email.trim().toLowerCase());
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();

  const email = user.email ?? "";
  if (!isPlatformAdminEmail(email)) {
    throw new ForbiddenError("Platform admin access required");
  }

  return {
    userId: user.id,
    email,
    admin: supabaseAdmin(),
    supabase,
  };
}

/** Soft check for UI — never trust client-only; APIs re-verify. */
export async function checkPlatformAdminSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return isPlatformAdminEmail(user?.email);
  } catch {
    return false;
  }
}

/** Re-export for routes that already use AccountContext patterns. */
export type { AccountContext };
