import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session-cookies";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/account";
import { isAccountRole, type AccountRole } from "@/lib/auth/roles";
import {
  fallbackPermissions,
  type Permission,
} from "@/lib/auth/permissions";
import { resolvePlatformUser } from "@/lib/auth/platform-admin";
import { getWorkspaceCookies } from "@/lib/auth/workspace-cookies";
import { filterNav } from "@/lib/nav/registry";
import { computeClientHealth } from "@/lib/platform/client-health";
import { query } from "@/lib/db/pool";

/**
 * GET /api/session/context
 * Native session + plain PostgreSQL (no Supabase Auth).
 */
export async function GET() {
  try {
    const user = await getRequestUser();
    if (!user) throw new UnauthorizedError();

    const email = user.email;
    const platformUser = await resolvePlatformUser(user.id, email);
    const { impersonateAccountId } = await getWorkspaceCookies();

    const { rows: profiles } = await query<{
      account_id: string | null;
      account_role: string | null;
      full_name: string | null;
      avatar_url: string | null;
    }>(
      `SELECT account_id, account_role, full_name, avatar_url
       FROM profiles WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const profile = profiles[0] ?? null;

    let accountId =
      impersonateAccountId || profile?.account_id || null;

    const surface: "platform" | "client" =
      platformUser && !impersonateAccountId ? "platform" : "client";

    const featureFlags = await loadFlags(accountId);

    if (!accountId && surface === "client") {
      return NextResponse.json({
        surface: "client",
        platformUser: platformUser
          ? {
              userId: platformUser.userId,
              email: platformUser.email,
              platformRole: platformUser.platformRole,
            }
          : null,
        workspace: null,
        accountRole: null,
        permissions: [],
        featureFlags,
        planEntitlements: {},
        branding: null,
        impersonation: null,
        switchableAccounts: [],
        nav: [],
        health: null,
        onboarding: null,
        user: {
          id: user.id,
          email,
          fullName: profile?.full_name ?? user.fullName,
          avatarUrl: profile?.avatar_url ?? null,
        },
      });
    }

    let workspace: Record<string, unknown> | null = null;
    let accountRole: AccountRole | null =
      profile?.account_role && isAccountRole(profile.account_role)
        ? profile.account_role
        : null;

    let planEntitlements: Record<string, boolean> = {};

    if (accountId) {
      const { rows: accts } = await query<{
        id: string;
        name: string;
        display_name: string | null;
        logo_url: string | null;
        primary_color: string | null;
        status: string;
        plan_slug: string | null;
        plan_name: string | null;
        entitlements: Record<string, boolean> | null;
      }>(
        `SELECT a.id, a.name, a.display_name, a.logo_url, a.primary_color, a.status,
                p.slug AS plan_slug, p.name AS plan_name, p.entitlements
         FROM accounts a
         LEFT JOIN software_plans p ON p.id = a.plan_id
         WHERE a.id = $1`,
        [accountId],
      );
      const acct = accts[0];
      if (acct) {
        workspace = {
          id: acct.id,
          name: acct.display_name || acct.name,
          status: acct.status ?? "active",
          planSlug: acct.plan_slug,
          planName: acct.plan_name,
          logoUrl: acct.logo_url,
          primaryColor: acct.primary_color,
        };
        planEntitlements = acct.entitlements ?? {};
      }
      if (impersonateAccountId && platformUser) accountRole = "owner";
    }

    let permissions: Permission[] = fallbackPermissions({
      platformRole: platformUser?.platformRole,
      accountRole: surface === "client" ? accountRole : null,
    });

    if (platformUser) {
      const { rows } = await query<{ permission_key: string }>(
        `SELECT permission_key FROM role_permissions WHERE platform_role = $1`,
        [platformUser.platformRole],
      );
      if (rows.length) {
        permissions = [
          ...new Set([
            ...permissions,
            ...rows.map((r) => r.permission_key as Permission),
          ]),
        ];
      }
    }

    if (surface === "client" && accountRole) {
      const { rows } = await query<{ permission_key: string }>(
        `SELECT permission_key FROM role_permissions WHERE account_role = $1`,
        [accountRole],
      );
      if (rows.length) {
        permissions = [
          ...new Set(rows.map((r) => r.permission_key as Permission)),
        ];
      }
    }

    let health: ReturnType<typeof computeClientHealth> | null = null;
    let onboarding: {
      steps: { id: string; title: string; href: string; done: boolean }[];
      progress: number;
      complete: boolean;
    } | null = null;
    if (accountId && surface === "client") {
      const [wa, ai, kb, flows] = await Promise.all([
        countWhere("whatsapp_config", accountId),
        countWhere("ai_configs", accountId),
        countWhere("ai_knowledge_documents", accountId),
        countWhere("flows", accountId, `status = 'active'`),
      ]);
      health = computeClientHealth({
        whatsappConnected: wa > 0,
        aiConfigured: ai > 0,
        knowledgeHasDocs: kb > 0,
        automationActive: flows > 0,
        status: (workspace?.status as "active" | "suspended") ?? "active",
      });

      const steps = [
        {
          id: "whatsapp",
          title: "Connect WhatsApp",
          href: "/settings?tab=whatsapp",
          done: wa > 0,
        },
        {
          id: "ai",
          title: "Connect AI",
          href: "/agents?tab=studio",
          done: ai > 0,
        },
        {
          id: "knowledge",
          title: "Upload Knowledge",
          href: "/agents?tab=knowledge",
          done: kb > 0,
        },
        {
          id: "automation",
          title: "Publish first automation",
          href: "/flows",
          done: flows > 0,
        },
      ];
      const doneCount = steps.filter((s) => s.done).length;
      onboarding = {
        steps,
        progress: Math.round((doneCount / steps.length) * 100),
        complete: doneCount === steps.length,
      };
    }

    let switchableAccounts: Array<{ id: string; name: string; status: string }> =
      [];
    if (platformUser) {
      const { rows } = await query<{
        id: string;
        name: string;
        display_name: string | null;
        status: string;
      }>(
        `SELECT a.id, a.name, a.display_name, a.status
         FROM accounts a
         WHERE a.owner_user_id NOT IN (
           SELECT user_id FROM platform_users WHERE status = 'active'
         )
         ORDER BY a.name
         LIMIT 100`,
      );
      switchableAccounts = rows.map((a) => ({
        id: a.id,
        name: a.display_name || a.name,
        status: a.status ?? "active",
      }));
    }

    const nav = filterNav({
      surface,
      permissions,
      featureFlags,
      planEntitlements,
    });

    return NextResponse.json({
      surface,
      platformUser: platformUser
        ? {
            userId: platformUser.userId,
            email: platformUser.email,
            platformRole: platformUser.platformRole,
          }
        : null,
      workspace,
      accountRole,
      permissions,
      featureFlags,
      planEntitlements,
      branding: workspace
        ? {
            logoUrl: workspace.logoUrl,
            primaryColor: workspace.primaryColor,
            name: workspace.name,
          }
        : null,
      impersonation: impersonateAccountId
        ? {
            accountId: impersonateAccountId,
            accountName: workspace?.name ?? "Client",
          }
        : null,
      switchableAccounts,
      nav,
      health,
      onboarding,
      user: {
        id: user.id,
        email,
        fullName: profile?.full_name ?? user.fullName,
        avatarUrl: profile?.avatar_url ?? null,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

async function loadFlags(accountId: string | null) {
  const { rows } = await query<{ key: string; enabled: boolean }>(
    `SELECT key, enabled FROM feature_flags
     WHERE account_id IS NULL OR account_id = $1`,
    [accountId],
  );
  const out: Record<string, boolean> = {};
  for (const r of rows) out[r.key] = r.enabled;
  return out;
}

async function countWhere(
  table: string,
  accountId: string,
  extra = "TRUE",
): Promise<number> {
  const allowed = new Set([
    "whatsapp_config",
    "ai_configs",
    "ai_knowledge_documents",
    "flows",
  ]);
  if (!allowed.has(table)) return 0;
  const { rows } = await query<{ c: string }>(
    `SELECT count(*)::text AS c FROM ${table} WHERE account_id = $1 AND (${extra})`,
    [accountId],
  );
  return Number(rows[0]?.c ?? 0);
}
