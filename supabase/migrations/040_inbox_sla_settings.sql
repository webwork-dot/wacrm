-- 040_inbox_sla_settings.sql
-- Wave C: per-account SLA settings + conversation SLA timestamps.
-- Idempotent.

CREATE TABLE IF NOT EXISTS inbox_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  first_response_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (first_response_minutes > 0),
  next_response_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (next_response_minutes > 0),
  resolution_minutes INTEGER NOT NULL DEFAULT 1440
    CHECK (resolution_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inbox_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_settings_select ON inbox_settings;
DROP POLICY IF EXISTS inbox_settings_upsert ON inbox_settings;

CREATE POLICY inbox_settings_select ON inbox_settings
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY inbox_settings_insert ON inbox_settings
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY inbox_settings_update ON inbox_settings
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS next_response_due_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_responded_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_first_response_due
  ON conversations (first_response_due_at)
  WHERE first_response_due_at IS NOT NULL AND first_responded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_next_response_due
  ON conversations (next_response_due_at)
  WHERE next_response_due_at IS NOT NULL;
