/**
 * Feature gates — flags × plan entitlements (locked module surface).
 */

export function isFeatureEnabled(
  featureFlags: Record<string, boolean>,
  planEntitlements: Record<string, boolean> | null | undefined,
  opts: { featureFlag?: string; planEntitlement?: string },
): boolean {
  if (opts.featureFlag && featureFlags[opts.featureFlag] === false) {
    return false;
  }
  if (
    opts.planEntitlement &&
    planEntitlements &&
    planEntitlements[opts.planEntitlement] === false
  ) {
    return false;
  }
  return true;
}

