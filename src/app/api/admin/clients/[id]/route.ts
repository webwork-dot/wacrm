import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

/**
 * PATCH /api/admin/clients/[id]
 * Body: { status?, plan_id?, plan_notes? }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { admin, userId } = await requirePlatformAdmin();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status === "active" || body.status === "suspended") {
      patch.status = body.status;
    }
    if ("plan_id" in body) {
      patch.plan_id = body.plan_id || null;
      patch.plan_assigned_at = new Date().toISOString();
    }
    if ("plan_notes" in body) {
      patch.plan_notes =
        typeof body.plan_notes === "string" ? body.plan_notes : null;
    }

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("accounts")
      .update(patch)
      .eq("id", id)
      .select(
        "id, name, status, plan_id, plan_assigned_at, plan_notes, software_plans ( slug, name )",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Audit via platform_settings last-touch is too coarse; use platform_events if present.
    void admin.from("platform_events").insert({
      account_id: id,
      event_type: "admin.account.updated",
      payload: { ...patch, by: userId },
    });

    return NextResponse.json({ client: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
