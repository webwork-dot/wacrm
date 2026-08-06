-- ============================================================
-- Wave C2 — AI Studio + Knowledge Hub + Onboarding hooks
--
-- Extends existing ai_configs / ai_knowledge_* (no new product
-- modules). Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. AI Studio wizard profile (drives prompt generator)
-- ------------------------------------------------------------
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS studio_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ai_configs.studio_profile IS
  'AI Studio wizard fields: business, products, tone, restrictions, languages, support_hours, guardrails. Used to generate system_prompt.';

-- ------------------------------------------------------------
-- 2. Sandbox / AI execution traces
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_execution_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN (
    'sandbox', 'playground', 'draft', 'auto_reply'
  )),
  -- Trace payload: prompt preview, retrieval snippets, tools used,
  -- latency_ms, tokens, estimated_cost, confidence, reply excerpt.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_execution_traces_account
  ON ai_execution_traces (account_id, created_at DESC);

ALTER TABLE ai_execution_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read ai traces" ON ai_execution_traces;
CREATE POLICY "Members read ai traces"
  ON ai_execution_traces FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS "Agents insert ai traces" ON ai_execution_traces;
CREATE POLICY "Agents insert ai traces"
  ON ai_execution_traces FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

-- ------------------------------------------------------------
-- 3. Knowledge Hub metadata on documents
-- ------------------------------------------------------------
ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'faq', 'pdf', 'website'));

ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('idle', 'syncing', 'synced', 'error'));

ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Backfill last_synced_at for existing docs
UPDATE ai_knowledge_documents
SET last_synced_at = COALESCE(last_synced_at, updated_at)
WHERE last_synced_at IS NULL;

-- ------------------------------------------------------------
-- 4. Onboarding completion on accounts
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
