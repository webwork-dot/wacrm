import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/account";
import { isAccountRole, type AccountRole } from "@/lib/auth/roles";
import {
  fallbackPermissions,
  type Permission,
} from "@/lib/auth/permissions";
import { loadFeatureFlags } from "@/lib/auth/feature-flags";
import { resolvePlatformUser } from "@/lib/auth/platform-admin";
import {
  getWorkspaceCookies,
} from "@/lib/auth/workspace-cookies";
import { filterNav } from "@/lib/nav/registry";
import { computeClientHealth } from "@/lib/platform/client-health";
import { loadAccountPlan } from "@/lib/platform/plans";

/**
 * GET /api/session/context
 * Single payload for shells: surface, workspace, permissions, flags, nav, health.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) throw new UnauthorizedError();

    const admin = supabaseAdmin();
    const email = user.email ?? "";
    const platformUser = await resolvePlatformUser(user.id, email);
    const { impersonateAccountId } = await getWorkspaceCookies();

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id, account_role, full_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    let accountId =
      impersonateAccountId ||
      (profile?.account_id as string | null) ||
      null;

    // Platform user without impersonation → platform surface
    const surface: "platform" | "client" =
      platformUser && !impersonateAccountId ? "platform" : "client";

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
        featureFlags: await loadFeatureFlags(admin),
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
          fullName: profile?.full_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
      });
    }

    // Load account + plan
    let workspace: Record<string, unknown> | null = null;
    let accountRole: AccountRole | null =
      profile?.account_role && isAccountRole(profile.account_role)
        ? profile.account_role
        : null;

    if (accountId) {
      const { data: acct } = await admin
        .from("accounts")
        .select(
          "id, name, display_name, logo_url, primary_color, status, plan_id, software_plans ( slug, name, entitlements )",
        )
        .eq("id", accountId)
        .maybeSingle();

      if (acct) {
        const planRaw = (acct as { software_plans?: unknown }).software_plans;
        const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;
        workspace = {
          id: acct.id,
          name: (acct as { display_name?: string }).display_name || acct.name,
          status: (acct as { status?: string }).status ?? "active",
          planSlug: (plan as { slug?: string } | null)?.slug ?? null,
          planName: (plan as { name?: string } | null)?.name ?? null,
          logoUrl: (acct as { logo_url?: string }).logo_url ?? null,
          primaryColor: (acct as { primary_color?: string }).primary_color ?? null,
        };
      }

      // When impersonating, treat as owner-equivalent for viewing (read path);
      // permissions still come from platform + client owner grants for support.
      if (impersonateAccountId && platformUser) {
        accountRole = "owner";
      }
    }

    // Permissions
    let permissions: Permission[] = fallbackPermissions({
      platformRole: platformUser?.platformRole,
      accountRole: surface === "client" ? accountRole : null,
    });

    try {
      if (platformUser) {
        const { data: pr } = await admin
          .from("role_permissions")
          .select("permission_key")
          .eq("platform_role", platformUser.platformRole);
        if (pr?.length) {
          permissions = [
            ...new Set([
              ...permissions,
              ...pr.map((r) => r.permission_key as Permission),
            ]),
          ];
        }
      }
      if (surface === "client" && accountRole) {
        const { data: ar } = await admin
          .from("role_permissions")
          .select("permission_key")
          .eq("account_role", accountRole);
        if (ar?.length) {
          const clientPerms = ar.map((r) => r.permission_key as Permission);
          if (platformUser && impersonateAccountId) {
            permissions = [...new Set([...permissions, ...clientPerms])];
          } else if (!platformUser || impersonateAccountId) {
            permissions = [
              ...new Set([
                ...(platformUser
                  ? permissions.filter((p) => p.startsWith("platform."))
                  : []),
                ...clientPerms,
              ]),
            ];
          } else {
            permissions = clientPerms;
          }
        }
      }
    } catch {
      /* pre-045 */
    }

    const featureFlags = await loadFeatureFlags(admin, accountId);
    let planEntitlements: Record<string, boolean> = {};
    if (accountId) {
      try {
        const planInfo = await loadAccountPlan(admin, accountId);
        planEntitlements = planInfo.plan?.entitlements ?? {};
      } catch {
        /* ignore */
      }
    }

    // Health (client workspace)
    let health = null;
    if (accountId && surface === "client") {
      const [wa, ai, kb, flows] = await Promise.all([
        admin
          .from("whatsapp_config")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId),
        admin
          .from("ai_configs")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId),
        admin
          .from("ai_knowledge_documents")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId),
        admin
          .from("flows")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .eq("status", "active"),
      ]);
      health = computeClientHealth({
        whatsappConnected: (wa.count ?? 0) > 0,
        aiConfigured: (ai.count ?? 0) > 0,
        knowledgeHasDocs: (kb.count ?? 0) > 0,
        automationActive: (flows.count ?? 0) > 0,
        status:
          (workspace?.status as "active" | "suspended") ?? "active",
      });
    }

    // Onboarding checklist for client
    let onboarding = null;
    if (accountId && surface === "client" && health) {
      const steps = [
        {
          id: "whatsapp",
          title: "Connect WhatsApp",
          href: "/settings?tab=whatsapp",
          done: health.score >= 30 || !health.reasons.includes("WhatsApp not connected"),
        },
        {
          id: "ai",
          title: "Connect AI",
          href: "/agents?tab=studio",
          done: !health.reasons.includes("AI not set up"),
        },
        {
          id: "knowledge",
          title: "Upload Knowledge",
          href: "/agents?tab=knowledge",
          done: !health.reasons.includes("No knowledge documents"),
        },
        {
          id: "automation",
          title: "Publish first automation",
          href: "/flows",
          done: !health.reasons.includes("No active automation"),
        },
      ];
      // Recompute done flags more accurately
      const [wa, ai, kb, fl] = await Promise.all([
        admin.from("whatsapp_config").select("id").eq("account_id", accountId).limit(1),
        admin.from("ai_configs").select("id").eq("account_id", accountId).limit(1),
        admin.from("ai_knowledge_documents").select("id").eq("account_id", accountId).limit(1),
        admin.from("flows").select("id").eq("account_id", accountId).eq("status", "active").limit(1),
      ]);
      steps[0].done = (wa.data?.length ?? 0) > 0;
      steps[1].done = (ai.data?.length ?? 0) > 0;
      steps[2].done = (kb.data?.length ?? 0) > 0;
      steps[3].done = (fl.data?.length ?? 0) > 0;
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
      const [{ data: accounts }, { data: platformRows }] = await Promise.all([
        admin
          .from("accounts")
          .select("id, name, display_name, status, owner_user_id")
          .order("name")
          .limit(100),
        admin.from("platform_users").select("user_id").eq("status", "active"),
      ]);
      const platformOwnerIds = new Set(
        (platformRows ?? []).map((r) => r.user_id as string),
      );
      switchableAccounts = (accounts ?? [])
        .filter((a) => !platformOwnerIds.has(a.owner_user_id as string))
        .map((a) => ({
          id: a.id,
          name: (a as { display_name?: string }).display_name || a.name,
          status: (a as { status?: string }).status ?? "active",
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
        fullName: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
