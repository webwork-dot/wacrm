import { NextResponse } from "next/server";
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { getOnboardingStatus } from "@/lib/platform/onboarding";

/** GET /api/onboarding — checklist progress for the current account. */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const status = await getOnboardingStatus(supabase, accountId);
    return NextResponse.json(status);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST /api/onboarding — mark onboarding complete (admin+). */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("admin");
    const body = await request.json().catch(() => ({}));
    const complete = body?.complete !== false;

    const { error } = await supabase
      .from("accounts")
      .update({
        onboarding_completed_at: complete ? new Date().toISOString() : null,
      })
      .eq("id", accountId);

    if (error) {
      // Column missing until 043 — soft-fail with progress only.
      if (
        error.code === "42703" ||
        /onboarding_completed_at/i.test(error.message)
      ) {
        return NextResponse.json({
          success: true,
          warning: "Apply migration 043 to persist onboarding completion.",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const status = await getOnboardingStatus(supabase, accountId);
    return NextResponse.json({ success: true, ...status });
  } catch (err) {
    return toErrorResponse(err);
  }
}
