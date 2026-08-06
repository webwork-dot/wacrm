import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { listSoftwarePlans } from "@/lib/platform/plans";

/** GET /api/admin/plans */
export async function GET() {
  try {
    const { admin } = await requirePlatformAdmin();
    const plans = await listSoftwarePlans(admin);
    return NextResponse.json({ plans });
  } catch (err) {
    return toErrorResponse(err);
  }
}
