import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { listSoftwarePlans } from "@/lib/platform/plans";

/** GET /api/admin/clients — list all accounts (platform admin). */
export async function GET(request: Request) {
  try {
    const { admin } = await requirePlatformAdmin();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status");

    let query = admin
      .from("accounts")
      .select(
        "id, name, status, plan_id, plan_assigned_at, plan_notes, created_at, owner_user_id, software_plans ( slug, name ), onboarding_completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (status === "active" || status === "suspended") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let clients = data ?? [];
    if (q) {
      clients = clients.filter((c) =>
        String((c as { name?: string }).name ?? "")
          .toLowerCase()
          .includes(q),
      );
    }

    const plans = await listSoftwarePlans(admin);
    return NextResponse.json({ clients, plans });
  } catch (err) {
    return toErrorResponse(err);
  }
}
