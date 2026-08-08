import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth/native";
import { applySessionCookies } from "@/lib/auth/session-cookies";
import { resolvePlatformUser } from "@/lib/auth/platform-admin";
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
    const limit = checkRateLimit(`auth:login:${ip}`, RATE_LIMITS.authLogin);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await req.json()) as {
      email?: string;
      password?: string;
      rememberMe?: boolean;
    };

    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const userAgent = req.headers.get("user-agent");

    const result = await loginWithPassword({
      email: body.email,
      password: body.password,
      rememberMe: body.rememberMe,
      ip,
      userAgent,
    });

    if (!result.ok) {
      const status = result.code === "locked" ? 423 : 401;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }

    const platformUser = await resolvePlatformUser(
      result.user.id,
      result.user.email,
    );

    const res = NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
      surface: platformUser ? "platform" : "client",
    });

    applySessionCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    });

    return res;
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
