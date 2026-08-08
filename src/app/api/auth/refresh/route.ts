import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshSession } from "@/lib/auth/native";
import { REFRESH_COOKIE } from "@/lib/auth/session-constants";
import {
  applySessionCookies,
  clearSessionCookies,
} from "@/lib/auth/session-cookies";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/** Rotate access JWT using opaque refresh cookie. */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const limit = checkRateLimit(`auth:refresh:${ip}`, RATE_LIMITS.authRefresh);
  if (!limit.success) return rateLimitResponse(limit);

  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    const res = NextResponse.json({ error: "No refresh token" }, { status: 401 });
    clearSessionCookies(res);
    return res;
  }

  const rotated = await refreshSession({ refreshToken: refresh });
  if (!rotated) {
    const res = NextResponse.json({ error: "Session expired" }, { status: 401 });
    clearSessionCookies(res);
    return res;
  }

  const res = NextResponse.json({ ok: true });
  applySessionCookies(res, {
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    expiresAt: rotated.expiresAt,
  });
  return res;
}
