import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

/** GET /api/admin/health — lightweight platform health. */
export async function GET() {
  try {
    const { admin } = await requirePlatformAdmin();

    const { data: platformRows } = await admin
      .from("platform_users")
      .select("user_id")
      .eq("status", "active");
    const platformOwnerIds = new Set(
      (platformRows ?? []).map((r) => r.user_id as string),
    );

    const { data: allAccounts } = await admin
      .from("accounts")
      .select("id, status, owner_user_id");

    const clients = (allAccounts ?? []).filter(
      (a) => !platformOwnerIds.has(a.owner_user_id as string),
    );
    const suspended = clients.filter((a) => a.status === "suspended").length;

    const [events, traces] = await Promise.all([
      admin.from("platform_events").select("id", { count: "exact", head: true }),
      admin.from("usage_events").select("id", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      ok: true,
      accounts: clients.length,
      suspended,
      platform_events: events.error ? null : (events.count ?? 0),
      usage_events: traces.error ? null : (traces.count ?? 0),
      env: {
        platform_admin_configured: Boolean(
          process.env.PLATFORM_ADMIN_EMAILS?.trim(),
        ),
        cron_configured: Boolean(process.env.AUTOMATION_CRON_SECRET),
      },
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
