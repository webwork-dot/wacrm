/**
 * Platform operator access — plain PostgreSQL + native sessions.
 */

import { getRequestUser } from "@/lib/auth/session-cookies";
import { dbAdmin, type DbClient } from "@/lib/db/client";
import { query } from "@/lib/db/pool";
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
  admin: DbClient;
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

async function loadPlatformPermissions(role: PlatformRole): Promise<Permission[]> {
  const { rows } = await query<{ permission_key: string }>(
    `SELECT permission_key FROM role_permissions WHERE platform_role = $1`,
    [role],
  );
  if (!rows.length) return fallbackPermissions({ platformRole: role });
  return rows.map((r) => r.permission_key as Permission);
}

export async function resolvePlatformUser(
  userId: string,
  email: string,
): Promise<PlatformUserRow | null> {
  const { rows } = await query<{
    user_id: string;
    platform_role: PlatformRole;
    status: string;
  }>(
    `SELECT user_id, platform_role, status FROM platform_users WHERE user_id = $1`,
    [userId],
  );

  const existing = rows[0];
  if (existing) {
    if (existing.status === "disabled") return null;
    await query(
      `UPDATE platform_users SET last_login_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    return {
      userId,
      email,
      platformRole: existing.platform_role,
      status: "active",
    };
  }

  if (!isPlatformAdminEmail(email)) return null;

  // Do NOT auto-promote on email match alone — that lets an attacker
  // change their email to an allowlisted address and become platform owner.
  // Bootstrap only via db:seed / explicit platform_users insert.
  return null;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const user = await getRequestUser();
  if (!user) throw new UnauthorizedError();

  const row = await resolvePlatformUser(user.id, user.email);
  if (!row) throw new ForbiddenError("Platform admin access required");

  const permissions = await loadPlatformPermissions(row.platformRole);

  return {
    userId: user.id,
    email: user.email,
    platformRole: row.platformRole,
    permissions,
    admin: dbAdmin(),
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
    const user = await getRequestUser();
    if (!user) return false;
    const row = await resolvePlatformUser(user.id, user.email);
    return !!row;
  } catch {
    return false;
  }
}

export type { AccountContext };
