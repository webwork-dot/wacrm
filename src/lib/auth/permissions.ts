/**
 * Permission Engine — locked module.
 * UI/API ask can(); never hardcode role checks in new shell code.
 */

import type { AccountRole } from "@/lib/auth/roles";

export type PlatformRole = "owner" | "admin";

export type Permission =
  | "platform.console.access"
  | "platform.clients.read"
  | "platform.clients.write"
  | "platform.impersonate"
  | "platform.plans.read"
  | "platform.plans.assign"
  | "platform.settings.write"
  | "platform.activity.read"
  | "client.dashboard.access"
  | "client.inbox.access"
  | "client.contacts.access"
  | "client.broadcasts.access"
  | "client.automations.access"
  | "client.ai.access"
  | "client.knowledge.access"
  | "client.reports.access"
  | "client.settings.view"
  | "client.settings.edit"
  | "client.members.manage"
  | "client.messages.send";

/** Fallback grants when DB seeds are missing (pre-045). */
const PLATFORM_FALLBACK: Record<PlatformRole, Permission[]> = {
  owner: [
    "platform.console.access",
    "platform.clients.read",
    "platform.clients.write",
    "platform.impersonate",
    "platform.plans.read",
    "platform.plans.assign",
    "platform.settings.write",
    "platform.activity.read",
  ],
  admin: [
    "platform.console.access",
    "platform.clients.read",
    "platform.clients.write",
    "platform.impersonate",
    "platform.plans.read",
    "platform.plans.assign",
    "platform.settings.write",
    "platform.activity.read",
  ],
};

const ACCOUNT_FALLBACK: Record<AccountRole, Permission[]> = {
  owner: [
    "client.dashboard.access",
    "client.inbox.access",
    "client.contacts.access",
    "client.broadcasts.access",
    "client.automations.access",
    "client.ai.access",
    "client.knowledge.access",
    "client.reports.access",
    "client.settings.view",
    "client.settings.edit",
    "client.members.manage",
    "client.messages.send",
  ],
  admin: [
    "client.dashboard.access",
    "client.inbox.access",
    "client.contacts.access",
    "client.broadcasts.access",
    "client.automations.access",
    "client.ai.access",
    "client.knowledge.access",
    "client.reports.access",
    "client.settings.view",
    "client.settings.edit",
    "client.members.manage",
    "client.messages.send",
  ],
  manager: [
    "client.dashboard.access",
    "client.inbox.access",
    "client.contacts.access",
    "client.broadcasts.access",
    "client.automations.access",
    "client.ai.access",
    "client.knowledge.access",
    "client.reports.access",
    "client.settings.view",
    "client.messages.send",
  ],
  agent: [
    "client.dashboard.access",
    "client.inbox.access",
    "client.contacts.access",
    "client.broadcasts.access",
    "client.automations.access",
    "client.ai.access",
    "client.knowledge.access",
    "client.reports.access",
    "client.settings.view",
    "client.messages.send",
  ],
  viewer: [
    "client.dashboard.access",
    "client.inbox.access",
    "client.contacts.access",
    "client.reports.access",
    "client.settings.view",
  ],
};

export function fallbackPermissions(opts: {
  platformRole?: PlatformRole | null;
  accountRole?: AccountRole | null;
}): Permission[] {
  const set = new Set<Permission>();
  if (opts.platformRole) {
    for (const p of PLATFORM_FALLBACK[opts.platformRole] ?? []) set.add(p);
  }
  if (opts.accountRole) {
    for (const p of ACCOUNT_FALLBACK[opts.accountRole] ?? []) set.add(p);
  }
  return [...set];
}

export function can(
  permissions: readonly string[] | Set<string>,
  permission: Permission | string,
): boolean {
  if (permissions instanceof Set) return permissions.has(permission);
  return permissions.includes(permission);
}

export function canAny(
  permissions: readonly string[] | Set<string>,
  needed: readonly Permission[],
): boolean {
  return needed.some((p) => can(permissions, p));
}

/** Map plan entitlements / feature flags onto module access. */
export function isFeatureEnabled(
  flags: Record<string, boolean>,
  key: string,
  planEntitlements?: Record<string, boolean> | null,
): boolean {
  if (flags[key] === false) return false;
  if (
    planEntitlements &&
    key in planEntitlements &&
    planEntitlements[key] === false
  ) {
    return false;
  }
  return true;
}
