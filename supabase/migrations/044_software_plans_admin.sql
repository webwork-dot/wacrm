-- ============================================================
-- Wave D — Software plans + usage + account status
--
-- Convexa sells software only. Plans are manually assigned in
-- hidden Convexa Admin (not Meta/BSP billing). Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Software plans (catalog)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS software_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  -- Soft monthly caps (NULL = unlimited). Software metering only.
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Feature entitlements (flags) — extend existing patterns, not a new module.
  entitlements JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE software_plans ENABLE ROW LEVEL SECURITY;

-- Catalog is readable by any authenticated user (Settings usage panel).
DROP POLICY IF EXISTS "Authenticated read software plans" ON software_plans;
DROP POLICY IF EXISTS "Authenticated read active plans" ON software_plans;
CREATE POLICY "Authenticated read software plans"
  ON software_plans FOR SELECT
  TO authenticated
  USING (true);

-- ------------------------------------------------------------
-- 2. Account plan + lifecycle status
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES software_plans(id) ON DELETE SET NULL;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_assigned_at TIMESTAMPTZ;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts (status);
CREATE INDEX IF NOT EXISTS idx_accounts_plan_id ON accounts (plan_id);

-- ------------------------------------------------------------
-- 3. Software usage events (metering ledger)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'message.outbound',
    'broadcast.recipient',
    'automation.run',
    'flow.run',
    'ai.draft',
    'ai.auto_reply',
    'api.request',
    'other'
  )),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_account_created
  ON usage_events (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_account_type_created
  ON usage_events (account_id, event_type, created_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own usage events" ON usage_events;
CREATE POLICY "Members read own usage events"
  ON usage_events FOR SELECT
  USING (is_account_member(account_id));

-- Inserts via service role only (no authenticated INSERT policy).

-- ------------------------------------------------------------
-- 4. Platform settings (key/value for Convexa Admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
-- No authenticated policies — service-role / platform admin API only.

-- ------------------------------------------------------------
-- 5. Seed default plans
-- ------------------------------------------------------------
INSERT INTO software_plans (slug, name, description, limits, entitlements, sort_order)
VALUES
  (
    'free',
    'Free',
    'DIY starter — soft caps for evaluation.',
    '{"messages_outbound_monthly": 500, "broadcast_recipients_monthly": 100, "automation_runs_monthly": 200, "ai_calls_monthly": 100, "seats": 2}'::jsonb,
    '{"flows": true, "ai_studio": true, "knowledge_hub": true, "api_keys": false, "starter_kits": true}'::jsonb,
    10
  ),
  (
    'starter',
    'Starter',
    'Small teams running WhatsApp + light automation.',
    '{"messages_outbound_monthly": 5000, "broadcast_recipients_monthly": 2000, "automation_runs_monthly": 2000, "ai_calls_monthly": 1000, "seats": 5}'::jsonb,
    '{"flows": true, "ai_studio": true, "knowledge_hub": true, "api_keys": true, "starter_kits": true}'::jsonb,
    20
  ),
  (
    'growth',
    'Growth',
    'Higher throughput for growing support teams.',
    '{"messages_outbound_monthly": 25000, "broadcast_recipients_monthly": 15000, "automation_runs_monthly": 10000, "ai_calls_monthly": 5000, "seats": 20}'::jsonb,
    '{"flows": true, "ai_studio": true, "knowledge_hub": true, "api_keys": true, "starter_kits": true, "advanced_analytics": true}'::jsonb,
    30
  ),
  (
    'enterprise',
    'Enterprise',
    'Manual enterprise assignment — effectively unlimited soft caps.',
    '{"messages_outbound_monthly": null, "broadcast_recipients_monthly": null, "automation_runs_monthly": null, "ai_calls_monthly": null, "seats": null}'::jsonb,
    '{"flows": true, "ai_studio": true, "knowledge_hub": true, "api_keys": true, "starter_kits": true, "advanced_analytics": true, "priority_support": true}'::jsonb,
    40
  )
ON CONFLICT (slug) DO NOTHING;

-- Backfill accounts without a plan → free
UPDATE accounts a
SET
  plan_id = p.id,
  plan_assigned_at = COALESCE(a.plan_assigned_at, NOW())
FROM software_plans p
WHERE p.slug = 'free'
  AND a.plan_id IS NULL;
