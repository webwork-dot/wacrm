import { NextResponse } from "next/server";
import { changePassword } from "@/lib/auth/native";
import { getRequestUser } from "@/lib/auth/session-cookies";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function POST(req: Request) {
  const user = await getRequestUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(
    `auth:changePassword:${user.id}`,
    RATE_LIMITS.adminAction,
  );
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await req.json().catch(() => null)) as {
    currentPassword?: string;
    newPassword?: string;
  } | null;

  if (!body?.currentPassword || !body?.newPassword) {
    return NextResponse.json(
      { error: "currentPassword and newPassword are required" },
      { status: 400 },
    );
  }

  const result = await changePassword({
    userId: user.id,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
