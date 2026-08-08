import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/lib/auth/session-constants";

/**
 * Edge middleware — JWT verification only (no PostgreSQL).
 * Token refresh happens in Node route handlers / server components.
 */
export async function middleware(request: NextRequest) {
  const access = request.cookies.get(SESSION_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const claims = await verifyAccessToken(access);
  const user = claims ? { id: claims.sub, email: claims.email } : null;
  // Soft presence: valid refresh alone is not enough for Edge; treat as logged-out
  // until /api/auth/refresh issues a new access cookie. Protected pages will bounce
  // to login; login page can call refresh via client if needed.
  void refresh;

  const path = request.nextUrl.pathname;

  if (
    user &&
    (path === "/login" || path === "/signup" || path === "/forgot-password")
  ) {
    const url = request.nextUrl.clone();
    const inviteToken = request.nextUrl.searchParams.get("invite");
    if (inviteToken && (path === "/login" || path === "/signup")) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`;
      url.search = "";
    } else {
      url.pathname = "/dashboard";
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  const protectedPaths = [
    "/dashboard",
    "/inbox",
    "/contacts",
    "/pipelines",
    "/broadcasts",
    "/automations",
    "/settings",
    "/flows",
    "/agents",
    "/onboarding",
    "/starter-kits",
    "/notifications",
    "/admin",
    "/console",
  ];

  if (!user && protectedPaths.some((p) => path.startsWith(p))) {
    // Attempt silent refresh via rewrite to API then back — simpler: redirect login
    // Client shells call /api/auth/refresh on mount if needed.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (
    !user &&
    path.startsWith("/api/whatsapp/") &&
    !path.includes("/webhook")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
