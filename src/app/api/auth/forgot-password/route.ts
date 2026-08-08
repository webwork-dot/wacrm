import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth/native";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { createHmac } from "node:crypto";

/**
 * Always returns success to avoid email enumeration.
 * Token is logged in development until an email provider is wired.
 */
export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const limit = checkRateLimit(`auth:forgot:${ip}`, RATE_LIMITS.authForgot);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await req.json()) as { email?: string };
    if (!body.email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const token = await requestPasswordReset(body.email);
    if (token && process.env.NODE_ENV !== "production") {
      console.info(`[auth] password reset token for ${body.email}: ${token}`);
    }

    if (token && process.env.PASSWORD_RESET_WEBHOOK_URL) {
      const payload = {
        email: body.email,
        resetUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${token}`,
      };
      const bodyJson = JSON.stringify(payload);
      const sig = process.env.SESSION_SECRET
        ? createHmac("sha256", process.env.SESSION_SECRET)
            .update(bodyJson)
            .digest("hex")
        : "";
      await fetch(process.env.PASSWORD_RESET_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sig ? { "X-Convexa-Signature": sig } : {}),
        },
        body: bodyJson,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      message: "If that email exists, a reset link has been sent.",
    });
  } catch (err) {
    console.error("[auth/forgot-password]", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
