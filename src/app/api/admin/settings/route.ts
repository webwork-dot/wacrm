import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

/** GET/PUT /api/admin/settings — platform_settings key/value. */
export async function GET() {
  try {
    const { admin } = await requirePlatformAdmin();
    const { data, error } = await admin.from("platform_settings").select("*");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      const r = row as { key: string; value: unknown };
      settings[r.key] = r.value;
    }
    return NextResponse.json({ settings });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const { admin, userId } = await requirePlatformAdmin();
    const body = await request.json().catch(() => null);
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    const value = body?.value ?? {};

    const { error } = await admin.from("platform_settings").upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, key, value });
  } catch (err) {
    return toErrorResponse(err);
  }
}
