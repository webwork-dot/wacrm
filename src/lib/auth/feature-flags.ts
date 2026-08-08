/**
 * Feature Flags — plain PostgreSQL.
 */

import { query } from "@/lib/db/pool";

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
 * Resolve effective flags: defaults → global DB → account overrides.
 */
export async function loadFeatureFlags(
  _db?: unknown,
  accountId?: string | null,
): Promise<Record<string, boolean>> {
  const out = { ...DEFAULT_FLAGS };
  try {
    const { rows } = await query<{
      key: string;
      enabled: boolean;
      account_id: string | null;
    }>(
      accountId
        ? `SELECT key, enabled, account_id FROM feature_flags
           WHERE account_id IS NULL OR account_id = $1`
        : `SELECT key, enabled, account_id FROM feature_flags
           WHERE account_id IS NULL`,
      accountId ? [accountId] : [],
    );
    for (const g of rows.filter((r) => r.account_id == null)) {
      out[g.key] = g.enabled;
    }
    for (const o of rows.filter((r) => accountId && r.account_id === accountId)) {
      out[o.key] = o.enabled;
    }
  } catch {
    /* table missing */
  }
  return out;
}
