/**
 * Account role helpers — pure, unit-testable, no I/O.
 * Hierarchy: owner > admin > manager > agent > viewer
 * Mirrors is_account_member CASE in migration 045.
 */

export type AccountRole = "owner" | "admin" | "manager" | "agent" | "viewer";

export const ACCOUNT_ROLES: readonly AccountRole[] = [
  "viewer",
  "agent",
  "manager",
  "admin",
  "owner",
] as const;

export function roleRank(role: AccountRole): number {
  switch (role) {
    case "owner":
      return 5;
    case "admin":
      return 4;
    case "manager":
      return 3;
    case "agent":
      return 2;
    case "viewer":
      return 1;
  }
}

export function hasMinRole(role: AccountRole, min: AccountRole): boolean {
  return roleRank(role) >= roleRank(min);
}

export function isAccountRole(value: unknown): value is AccountRole {
  return (
    typeof value === "string" &&
    (ACCOUNT_ROLES as readonly string[]).includes(value)
  );
}

/** Owner / admin: invite, remove, change roles. */
export function canManageMembers(role: AccountRole): boolean {
  return hasMinRole(role, "admin");
}

/**
 * Owner / admin: edit account-wide settings (WhatsApp, AI keys, etc.).
 * Manager cannot edit credential settings.
 */
export function canEditSettings(role: AccountRole): boolean {
  return hasMinRole(role, "admin");
}

/** Owner / admin / manager / agent: operational writes. */
export function canSendMessages(role: AccountRole): boolean {
  return hasMinRole(role, "agent");
}

export function canViewOnly(role: AccountRole): boolean {
  return role === "viewer";
}

export function canDeleteAccount(role: AccountRole): boolean {
  return role === "owner";
}

export function canTransferOwnership(role: AccountRole): boolean {
  return role === "owner";
}
