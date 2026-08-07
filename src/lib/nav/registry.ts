/**
 * Dynamic navigation registry — filtered by permissions / flags / plan / surface.
 */

import type { Permission } from "@/lib/auth/permissions";

export type NavSurface = "platform" | "client";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  surface: NavSurface;
  permission?: Permission;
  featureFlag?: string;
  planEntitlement?: string;
  /** lucide icon name key resolved in UI */
  icon: string;
}

export const NAV_REGISTRY: NavItem[] = [
  // Platform
  { id: "p-dashboard", href: "/console", label: "Dashboard", surface: "platform", permission: "platform.console.access", icon: "LayoutDashboard" },
  { id: "p-clients", href: "/console/clients", label: "Clients", surface: "platform", permission: "platform.clients.read", icon: "Building2" },
  // Plans hidden for now — selling WhatsApp service / add-ons; software plans later
  // { id: "p-plans", href: "/console/plans", label: "Plans", surface: "platform", permission: "platform.plans.read", icon: "CreditCard" },
  { id: "p-settings", href: "/console/settings", label: "System Settings", surface: "platform", permission: "platform.settings.write", icon: "Settings" },
  // Client
  { id: "c-dashboard", href: "/dashboard", label: "Dashboard", surface: "client", permission: "client.dashboard.access", icon: "LayoutDashboard" },
  { id: "c-inbox", href: "/inbox", label: "Inbox", surface: "client", permission: "client.inbox.access", icon: "MessageSquare" },
  { id: "c-notifications", href: "/notifications", label: "Notifications", surface: "client", permission: "client.dashboard.access", icon: "Bell" },
  { id: "c-contacts", href: "/contacts", label: "Contacts", surface: "client", permission: "client.contacts.access", icon: "Users" },
  { id: "c-broadcasts", href: "/broadcasts", label: "Broadcast", surface: "client", permission: "client.broadcasts.access", featureFlag: "broadcasts", icon: "Radio" },
  { id: "c-flows", href: "/flows", label: "Automation Studio", surface: "client", permission: "client.automations.access", featureFlag: "automations", icon: "Workflow" },
  { id: "c-ai", href: "/agents", label: "AI Studio", surface: "client", permission: "client.ai.access", featureFlag: "ai_studio", icon: "Bot" },
  { id: "c-pipelines", href: "/pipelines", label: "Pipelines", surface: "client", permission: "client.contacts.access", icon: "GitBranch" },
  { id: "c-settings", href: "/settings", label: "Settings", surface: "client", permission: "client.settings.view", icon: "Settings" },
];

export function filterNav(opts: {
  surface: NavSurface;
  permissions: readonly string[];
  featureFlags: Record<string, boolean>;
  planEntitlements?: Record<string, boolean> | null;
}): NavItem[] {
  const permSet = new Set(opts.permissions);
  return NAV_REGISTRY.filter((item) => {
    if (item.surface !== opts.surface) return false;
    if (item.permission && !permSet.has(item.permission)) return false;
    if (item.featureFlag && opts.featureFlags[item.featureFlag] === false) {
      return false;
    }
    if (
      item.planEntitlement &&
      opts.planEntitlements &&
      opts.planEntitlements[item.planEntitlement] === false
    ) {
      return false;
    }
    return true;
  });
}
