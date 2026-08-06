/**
 * Software plans + soft quota helpers (Convexa software only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export type UsageEventType =
  | "message.outbound"
  | "broadcast.recipient"
  | "automation.run"
  | "flow.run"
  | "ai.draft"
  | "ai.auto_reply"
  | "api.request"
  | "other";

export interface PlanLimits {
  messages_outbound_monthly?: number | null;
  broadcast_recipients_monthly?: number | null;
  automation_runs_monthly?: number | null;
  ai_calls_monthly?: number | null;
  seats?: number | null;
}

export interface SoftwarePlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  limits: PlanLimits;
  entitlements: Record<string, boolean>;
  sort_order: number;
  is_active: boolean;
}

export interface AccountPlanInfo {
  accountId: string;
  status: "active" | "suspended";
  plan: SoftwarePlan | null;
}

const EVENT_TO_LIMIT: Partial<Record<UsageEventType, keyof PlanLimits>> = {
  "message.outbound": "messages_outbound_monthly",
  "broadcast.recipient": "broadcast_recipients_monthly",
  "automation.run": "automation_runs_monthly",
  "flow.run": "automation_runs_monthly",
  "ai.draft": "ai_calls_monthly",
  "ai.auto_reply": "ai_calls_monthly",
};

export function monthWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function loadAccountPlan(
  db: SupabaseClient,
  accountId: string,
): Promise<AccountPlanInfo> {
  const { data, error } = await db
    .from("accounts")
    .select(
      "id, status, plan_id, software_plans ( id, slug, name, description, limits, entitlements, sort_order, is_active )",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error || !data) {
    // Pre-044 schema
    return { accountId, status: "active", plan: null };
  }

  const rawPlan = (data as { software_plans?: unknown }).software_plans;
  const planRow = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  const status =
    (data as { status?: string }).status === "suspended"
      ? "suspended"
      : "active";

  return {
    accountId,
    status,
    plan: planRow
      ? ({
          ...(planRow as SoftwarePlan),
          limits: ((planRow as SoftwarePlan).limits ?? {}) as PlanLimits,
          entitlements:
            ((planRow as SoftwarePlan).entitlements ?? {}) as Record<
              string,
              boolean
            >,
        } as SoftwarePlan)
      : null,
  };
}

export async function listSoftwarePlans(
  db: SupabaseClient = supabaseAdmin(),
): Promise<SoftwarePlan[]> {
  const { data, error } = await db
    .from("software_plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[plans] list failed:", error.message);
    return [];
  }
  return (data ?? []) as SoftwarePlan[];
}

export async function sumUsage(
  db: SupabaseClient,
  accountId: string,
  eventType: UsageEventType,
  since: Date,
): Promise<number> {
  const { data, error } = await db
    .from("usage_events")
    .select("quantity")
    .eq("account_id", accountId)
    .eq("event_type", eventType)
    .gte("created_at", since.toISOString());

  if (error) {
    // Table missing until 044
    return 0;
  }
  return (data ?? []).reduce(
    (sum, row) => sum + Number((row as { quantity: number }).quantity ?? 0),
    0,
  );
}

export interface QuotaResult {
  allowed: boolean;
  reason?: string;
  used?: number;
  limit?: number | null;
}

/**
 * Soft quota check against the account's plan. Unlimited when limit is
 * null/undefined or plan missing (fail-open for pre-migration).
 */
export async function checkPlanQuota(
  accountId: string,
  eventType: UsageEventType,
  quantity = 1,
  db: SupabaseClient = supabaseAdmin(),
): Promise<QuotaResult> {
  const info = await loadAccountPlan(db, accountId);
  if (info.status === "suspended") {
    return { allowed: false, reason: "Account is suspended" };
  }
  const limitKey = EVENT_TO_LIMIT[eventType];
  if (!limitKey || !info.plan) return { allowed: true };

  const limit = info.plan.limits[limitKey];
  if (limit == null) return { allowed: true, limit: null };

  const { start } = monthWindow();
  const used = await sumUsage(db, accountId, eventType, start);
  if (used + quantity > limit) {
    return {
      allowed: false,
      reason: `Plan limit reached for ${eventType} (${used}/${limit} this month)`,
      used,
      limit,
    };
  }
  return { allowed: true, used, limit };
}

export async function recordUsageEvent(input: {
  accountId: string;
  eventType: UsageEventType;
  quantity?: number;
  meta?: Record<string, unknown>;
  db?: SupabaseClient;
}): Promise<void> {
  const db = input.db ?? supabaseAdmin();
  const { error } = await db.from("usage_events").insert({
    account_id: input.accountId,
    event_type: input.eventType,
    quantity: input.quantity ?? 1,
    meta: input.meta ?? {},
  });
  if (error && error.code !== "42P01") {
    console.warn("[usage] record failed:", error.message);
  }
}

export async function usageSummaryForAccount(
  accountId: string,
  db: SupabaseClient = supabaseAdmin(),
): Promise<{
  period_start: string;
  counters: Record<string, number>;
  plan: SoftwarePlan | null;
  status: string;
}> {
  const info = await loadAccountPlan(db, accountId);
  const { start } = monthWindow();
  const types: UsageEventType[] = [
    "message.outbound",
    "broadcast.recipient",
    "automation.run",
    "flow.run",
    "ai.draft",
    "ai.auto_reply",
    "api.request",
  ];
  const counters: Record<string, number> = {};
  await Promise.all(
    types.map(async (t) => {
      counters[t] = await sumUsage(db, accountId, t, start);
    }),
  );
  return {
    period_start: start.toISOString(),
    counters,
    plan: info.plan,
    status: info.status,
  };
}
