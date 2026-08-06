import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

/** GET /api/admin/health — lightweight platform health. */
export async function GET() {
  try {
    const { admin } = await requirePlatformAdmin();

    const [accounts, suspended, events, traces] = await Promise.all([
      admin.from("accounts").select("id", { count: "exact", head: true }),
      admin
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("status", "suspended"),
      admin
        .from("platform_events")
        .select("id", { count: "exact", head: true }),
      admin
        .from("usage_events")
        .select("id", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      ok: true,
      accounts: accounts.count ?? 0,
      suspended: suspended.count ?? 0,
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
