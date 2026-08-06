-- 039_inbox_collab.sql
-- Wave B: notification types, conversation notes, audit/timeline events.
-- Idempotent.

-- ============================================================
-- 1. Expand notifications.type
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'mention',
    'new_message',
    'ai_completed',
    'campaign_completed',
    'conversation_resolved',
    'message_failed'
  ));

-- Allow agents to insert notifications via SECURITY DEFINER RPC only
-- (existing REVOKE INSERT stays; RPC below inserts as definer).

CREATE OR REPLACE FUNCTION public.create_inbox_notification(
  p_account_id UUID,
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT is_account_member(p_account_id, 'agent') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Don't notify yourself for mentions / assignments you triggered.
  IF p_user_id = auth.uid() AND p_type = 'mention' THEN
    RETURN NULL;
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, title, body,
    conversation_id, contact_id, actor_user_id
  ) VALUES (
    p_account_id, p_user_id, p_type, p_title, p_body,
    p_conversation_id, p_contact_id, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

ALTER FUNCTION public.create_inbox_notification(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID
) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_inbox_notification(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID
) TO authenticated, service_role;

-- ============================================================
-- 2. conversation_notes (internal, markdown, mentions)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation
  ON conversation_notes (conversation_id, created_at DESC);

ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_notes_select ON conversation_notes;
DROP POLICY IF EXISTS conversation_notes_insert ON conversation_notes;
DROP POLICY IF EXISTS conversation_notes_update ON conversation_notes;
DROP POLICY IF EXISTS conversation_notes_delete ON conversation_notes;

CREATE POLICY conversation_notes_select ON conversation_notes
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY conversation_notes_insert ON conversation_notes
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'agent')
    AND auth.uid() = user_id
  );

CREATE POLICY conversation_notes_update ON conversation_notes
  FOR UPDATE USING (
    is_account_member(account_id, 'agent')
    AND auth.uid() = user_id
  );

CREATE POLICY conversation_notes_delete ON conversation_notes
  FOR DELETE USING (
    is_account_member(account_id, 'agent')
    AND auth.uid() = user_id
  );

-- ============================================================
-- 3. conversation_events (audit + timeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation
  ON conversation_events (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_events_account
  ON conversation_events (account_id, created_at DESC);

ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_events_select ON conversation_events;
DROP POLICY IF EXISTS conversation_events_insert ON conversation_events;

CREATE POLICY conversation_events_select ON conversation_events
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY conversation_events_insert ON conversation_events
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- Enable realtime for new tables (best-effort; ignore if already added).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversation_notes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversation_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
