-- 037_inbox_session_and_pin.sql
-- Meta 24h customer-service window + pin support for inbox sorting.
-- Idempotent: safe to re-run.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the latest inbound customer message per conversation.
UPDATE conversations c
SET last_customer_message_at = sub.last_at
FROM (
  SELECT conversation_id, MAX(created_at) AS last_at
  FROM messages
  WHERE sender_type = 'customer'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id
  AND c.last_customer_message_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_last_customer_message_at
  ON conversations (last_customer_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_is_pinned
  ON conversations (is_pinned DESC);
