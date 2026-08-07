/**
 * Workspace / session cookies for platform vs client context.
 */

import { cookies } from "next/headers";

export const COOKIE_ACCOUNT = "convexa_account_id";
export const COOKIE_IMPERSONATE = "convexa_impersonate";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

export async function getWorkspaceCookies(): Promise<{
  accountId: string | null;
  impersonateAccountId: string | null;
}> {
  const jar = await cookies();
  return {
    accountId: jar.get(COOKIE_ACCOUNT)?.value ?? null,
    impersonateAccountId: jar.get(COOKIE_IMPERSONATE)?.value ?? null,
  };
}

export async function setAccountCookie(accountId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_ACCOUNT, accountId, COOKIE_OPTS);
}

export async function setImpersonateCookie(accountId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_IMPERSONATE, accountId, COOKIE_OPTS);
}

export async function clearImpersonateCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_IMPERSONATE);
}
