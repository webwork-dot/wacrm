/**
 * Server-side account context — native sessions + plain PostgreSQL.
 */

import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session-cookies";
import { dbAdmin, type DbClient } from "@/lib/db/client";
import { query } from "@/lib/db/pool";
import { hasMinRole, isAccountRole, type AccountRole } from "./roles";

export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403 as const;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[toErrorResponse] uncategorized error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export interface AccountContext {
  /** Plain-PG query client (same chain shape as legacy supabase). */
  supabase: DbClient;
  userId: string;
  accountId: string;
  role: AccountRole;
  account: { id: string; name: string };
}

export async function getCurrentAccount(): Promise<AccountContext> {
  const user = await getRequestUser();
  if (!user) throw new UnauthorizedError();

  const { rows } = await query<{
    account_id: string | null;
    account_role: string | null;
  }>(
    `SELECT account_id, account_role FROM profiles WHERE user_id = $1 LIMIT 1`,
    [user.id],
  );
  const data = rows[0];
  if (!data?.account_id || !data.account_role) {
    throw new ForbiddenError("Profile is not linked to an account");
  }
  if (!isAccountRole(data.account_role)) {
    throw new ForbiddenError(`Unknown account role: ${data.account_role}`);
  }

  const { rows: accts } = await query<{
    id: string;
    name: string;
    status: string | null;
  }>(`SELECT id, name, status FROM accounts WHERE id = $1`, [data.account_id]);
  const account = accts[0];
  if (!account) {
    throw new ForbiddenError("Profile is not linked to an account");
  }
  if (account.status === "suspended") {
    throw new ForbiddenError("Account is suspended");
  }

  return {
    supabase: dbAdmin(),
    userId: user.id,
    accountId: data.account_id,
    role: data.account_role,
    account: { id: account.id, name: account.name },
  };
}

export async function requireRole(min: AccountRole): Promise<AccountContext> {
  const ctx = await getCurrentAccount();
  if (!hasMinRole(ctx.role, min)) {
    throw new ForbiddenError(
      `This action requires the '${min}' role or higher`,
    );
  }
  return ctx;
}
