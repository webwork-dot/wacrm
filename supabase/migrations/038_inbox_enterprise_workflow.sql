-- 038_inbox_enterprise_workflow.sql
-- Wave A: ownership metadata, star, snooze, expanded statuses, watchers.
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. Ownership + star + snooze columns
-- ============================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_replied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- Backfill assignment timestamp for existing assignees (best-effort).
UPDATE conversations
SET assigned_at = COALESCE(assigned_at, updated_at, created_at)
WHERE assigned_agent_id IS NOT NULL
  AND assigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_is_starred
  ON conversations (is_starred)
  WHERE is_starred = true;

CREATE INDEX IF NOT EXISTS idx_conversations_snoozed_until
  ON conversations (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent
  ON conversations (assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

-- ============================================================
-- 2. Expand conversation status CHECK
--    open | pending | resolved | closed | spam
-- ============================================================
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'pending', 'resolved', 'closed', 'spam'));

-- ============================================================
-- 3. conversation_watchers
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_watchers (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_watchers_user
  ON conversation_watchers (user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_watchers_account
  ON conversation_watchers (account_id);

ALTER TABLE conversation_watchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_watchers_select ON conversation_watchers;
DROP POLICY IF EXISTS conversation_watchers_insert ON conversation_watchers;
DROP POLICY IF EXISTS conversation_watchers_delete ON conversation_watchers;

CREATE POLICY conversation_watchers_select ON conversation_watchers
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY conversation_watchers_insert ON conversation_watchers
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'agent')
    AND auth.uid() = user_id
  );

CREATE POLICY conversation_watchers_delete ON conversation_watchers
  FOR DELETE USING (
    is_account_member(account_id, 'agent')
    AND auth.uid() = user_id
  );
