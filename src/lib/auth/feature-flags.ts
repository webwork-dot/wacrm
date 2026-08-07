/**
 * Feature Flags — locked module.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_FLAGS: Record<string, boolean> = {
  broadcasts: true,
  automations: true,
  ai_studio: true,
  knowledge_hub: true,
  starter_kits: true,
  api_keys: true,
  reports: true,
  onboarding: true,
};

/**
 * Resolve effective flags: global defaults, then global DB rows,
 * then account overrides (account wins).
 */
export async function loadFeatureFlags(
  db: SupabaseClient,
  accountId?: string | null,
): Promise<Record<string, boolean>> {
  const out = { ...DEFAULT_FLAGS };
  try {
    const { data, error } = await db
      .from("feature_flags")
      .select("key, enabled, account_id")
      .or(
        accountId
          ? `account_id.is.null,account_id.eq.${accountId}`
          : "account_id.is.null",
      );
    if (error) return out;
    const globals = (data ?? []).filter((r) => r.account_id == null);
    const overrides = (data ?? []).filter(
      (r) => accountId && r.account_id === accountId,
    );
    for (const g of globals) out[g.key] = g.enabled;
    for (const o of overrides) out[o.key] = o.enabled;
  } catch {
    /* pre-045 */
  }
  return out;
}
