/**
 * Platform operator access.
 * PLATFORM_ADMIN_EMAILS bootstraps platform_users once; then DB + Permission Engine.
 */

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  ForbiddenError,
  UnauthorizedError,
  type AccountContext,
} from "@/lib/auth/account";
import {
  can,
  fallbackPermissions,
  type Permission,
  type PlatformRole,
} from "@/lib/auth/permissions";

export interface PlatformUserRow {
  userId: string;
  email: string;
  platformRole: PlatformRole;
  status: "active" | "disabled";
}

export interface PlatformAdminContext {
  userId: string;
  email: string;
  platformRole: PlatformRole;
  permissions: Permission[];
  admin: ReturnType<typeof supabaseAdmin>;
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

async function loadPlatformPermissions(
  admin: ReturnType<typeof supabaseAdmin>,
  role: PlatformRole,
): Promise<Permission[]> {
  const { data, error } = await admin
    .from("role_permissions")
    .select("permission_key")
    .eq("platform_role", role);
  if (error || !data?.length) {
    return fallbackPermissions({ platformRole: role });
  }
  return data.map((r) => r.permission_key as Permission);
}

/**
 * Resolve platform user: DB row first; else bootstrap from allowlist.
 */
export async function resolvePlatformUser(
  userId: string,
  email: string,
): Promise<PlatformUserRow | null> {
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("platform_users")
    .select("user_id, platform_role, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if ((existing as { status: string }).status === "disabled") return null;
    await admin
      .from("platform_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("user_id", userId);
    return {
      userId,
      email,
      platformRole: (existing as { platform_role: PlatformRole }).platform_role,
      status: "active",
    };
  }

  if (!isPlatformAdminEmail(email)) return null;

  // Bootstrap: create platform owner from allowlist
  const { error } = await admin.from("platform_users").upsert({
    user_id: userId,
    platform_role: "owner",
    status: "active",
    last_login_at: new Date().toISOString(),
  });
  if (error) {
    // Table missing (pre-045) — fall back to email-only for transition
    console.warn("[platform] bootstrap upsert failed:", error.message);
    return {
      userId,
      email,
      platformRole: "owner",
      status: "active",
    };
  }

  return {
    userId,
    email,
    platformRole: "owner",
    status: "active",
  };
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();

  const email = user.email ?? "";
  const row = await resolvePlatformUser(user.id, email);
  if (!row) {
    throw new ForbiddenError("Platform admin access required");
  }

  const admin = supabaseAdmin();
  const permissions = await loadPlatformPermissions(admin, row.platformRole);

  return {
    userId: user.id,
    email,
    platformRole: row.platformRole,
    permissions,
    admin,
    supabase,
  };
}

export async function requirePlatformPermission(
  permission: Permission,
): Promise<PlatformAdminContext> {
  const ctx = await requirePlatformAdmin();
  if (!can(ctx.permissions, permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
  return ctx;
}

export async function checkPlatformAdminSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const row = await resolvePlatformUser(user.id, user.email ?? "");
    return !!row;
  } catch {
    return false;
  }
}

export type { AccountContext };
