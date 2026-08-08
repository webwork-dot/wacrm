import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logoutAllDevices, logoutSession } from "@/lib/auth/native";
import { REFRESH_COOKIE } from "@/lib/auth/session-constants";
import { clearSessionCookies, getRequestUser } from "@/lib/auth/session-cookies";

export async function POST(req: Request) {
  const jar = await cookies();
  const body = await req.json().catch(() => ({} as { scope?: string }));
  if (body?.scope === "global") {
    const user = await getRequestUser();
    if (user) await logoutAllDevices(user.id);
  } else {
    await logoutSession(jar.get(REFRESH_COOKIE)?.value);
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
