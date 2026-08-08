import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth/native";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/lib/auth/session-constants";

const isProd = process.env.NODE_ENV === "production";

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function applySessionCookies(
  res: NextResponse,
  opts: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  },
) {
  const options = sessionCookieOptions(opts.expiresAt);
  res.cookies.set(SESSION_COOKIE, opts.accessToken, options);
  res.cookies.set(REFRESH_COOKIE, opts.refreshToken, options);
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getRequestUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  return {
    id: claims.sub,
    email: claims.email,
    fullName: claims.name,
    emailConfirmedAt: null,
    lastSignInAt: null,
    isActive: true,
  };
}
