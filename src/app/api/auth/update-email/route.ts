import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session-cookies";
import { query } from "@/lib/db/pool";
import { verifyPassword } from "@/lib/auth/native";
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
    `auth:updateEmail:${user.id}`,
    RATE_LIMITS.adminAction,
  );
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    currentPassword?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!body?.currentPassword) {
    return NextResponse.json(
      { error: "currentPassword is required" },
      { status: 400 },
    );
  }

  const { rows } = await query<{ encrypted_password: string | null }>(
    `SELECT encrypted_password FROM users WHERE id = $1`,
    [user.id],
  );
  const hash = rows[0]?.encrypted_password;
  if (!hash || !(await verifyPassword(body.currentPassword, hash))) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 },
    );
  }

  try {
    await query(
      `UPDATE users SET email = $2, updated_at = NOW() WHERE id = $1`,
      [user.id, email],
    );
    await query(
      `UPDATE profiles SET email = $2, updated_at = NOW() WHERE user_id = $1`,
      [user.id, email],
    );
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
