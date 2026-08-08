import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/auth/native";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const limit = checkRateLimit(`auth:reset:${ip}`, RATE_LIMITS.authReset);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await req.json()) as { token?: string; password?: string };
    if (!body.token || !body.password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 },
      );
    }
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const ok = await resetPasswordWithToken(body.token, body.password);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/reset-password]", err);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
