import { NextResponse } from "next/server";
import {
  getCurrentAccount,
  toErrorResponse,
} from "@/lib/auth/account";
import { usageSummaryForAccount } from "@/lib/platform/plans";

/** GET /api/account/usage — client portal plan + monthly software usage. */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const summary = await usageSummaryForAccount(accountId, supabase);
    return NextResponse.json(summary);
  } catch (err) {
    return toErrorResponse(err);
  }
}
