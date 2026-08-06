import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { usageSummaryForAccount } from "@/lib/platform/plans";

/** GET /api/admin/usage?account_id= */
export async function GET(request: Request) {
  try {
    const { admin } = await requirePlatformAdmin();
    const accountId = new URL(request.url).searchParams.get("account_id");
    if (!accountId) {
      // Platform-wide rollup: last 50 usage events across tenants
      const { data, error } = await admin
        .from("usage_events")
        .select("id, account_id, event_type, quantity, created_at, meta")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ recent: data ?? [] });
    }

    const summary = await usageSummaryForAccount(accountId, admin);
    return NextResponse.json(summary);
  } catch (err) {
    return toErrorResponse(err);
  }
}
