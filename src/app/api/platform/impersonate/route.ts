import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformPermission } from "@/lib/auth/platform-admin";
import {
  setImpersonateCookie,
  clearImpersonateCookie,
  setAccountCookie,
} from "@/lib/auth/workspace-cookies";

/** POST { accountId } — start View As Client */
export async function POST(request: Request) {
  try {
    const { admin, userId } = await requirePlatformPermission(
      "platform.impersonate",
    );
    const body = await request.json().catch(() => null);
    const accountId =
      typeof body?.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }

    const { data: acct } = await admin
      .from("accounts")
      .select("id, name, display_name")
      .eq("id", accountId)
      .maybeSingle();
    if (!acct) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // End any open impersonation
    await admin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("platform_user_id", userId)
      .is("ended_at", null);

    await admin.from("impersonation_sessions").insert({
      platform_user_id: userId,
      target_account_id: accountId,
    });

    await admin.from("platform_events").insert({
      account_id: accountId,
      event_type: "admin.impersonation.started",
      payload: { by: userId },
    });

    await setImpersonateCookie(accountId);
    await setAccountCookie(accountId);

    return NextResponse.json({
      success: true,
      accountId,
      accountName:
        (acct as { display_name?: string }).display_name || acct.name,
      redirect: "/dashboard",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** DELETE — exit View As Client */
export async function DELETE() {
  try {
    const { admin, userId } = await requirePlatformPermission(
      "platform.impersonate",
    );

    const { data: open } = await admin
      .from("impersonation_sessions")
      .select("id, target_account_id")
      .eq("platform_user_id", userId)
      .is("ended_at", null)
      .maybeSingle();

    if (open) {
      await admin
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", open.id);
      await admin.from("platform_events").insert({
        account_id: open.target_account_id,
        event_type: "admin.impersonation.ended",
        payload: { by: userId },
      });
    }

    await clearImpersonateCookie();
    return NextResponse.json({ success: true, redirect: "/console" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
