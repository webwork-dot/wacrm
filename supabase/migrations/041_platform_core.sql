-- 041_platform_core.sql
-- Wave C0: Connections Manager + durable event log foundations.
-- Idempotent. Does NOT remove whatsapp_config / ai_configs — adapters
-- keep reading those until callers migrate to connection_id.

-- ============================================================
-- 1. connections (Connections Manager)
-- ============================================================
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('healthy', 'degraded', 'error', 'unknown', 'disconnected')),
  -- Non-secret metadata (phone_number_id, model, base_url, etc.)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Encrypted JSON blob of secrets (tokens, api keys). App-layer encrypt.
  secrets_encrypted TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  latency_ms INTEGER,
  expires_at TIMESTAMPTZ,
  -- client_owned = DIY Meta/AI keys (default). platform_managed reserved
  -- for a future BSP mode — do not use in product yet.
  provider_mode TEXT NOT NULL DEFAULT 'client_owned'
    CHECK (provider_mode IN ('client_owned', 'platform_managed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, type, name)
);

CREATE INDEX IF NOT EXISTS idx_connections_account
  ON connections (account_id);

CREATE INDEX IF NOT EXISTS idx_connections_account_type
  ON connections (account_id, type);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connections_select ON connections;
DROP POLICY IF EXISTS connections_insert ON connections;
DROP POLICY IF EXISTS connections_update ON connections;
DROP POLICY IF EXISTS connections_delete ON connections;

CREATE POLICY connections_select ON connections
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY connections_insert ON connections
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY connections_update ON connections
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

CREATE POLICY connections_delete ON connections
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- 2. platform_events (Event Bus durable log / outbox seed)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_account_created
  ON platform_events (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_events_type
  ON platform_events (account_id, event_type, created_at DESC);

ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_events_select ON platform_events;
DROP POLICY IF EXISTS platform_events_insert ON platform_events;

CREATE POLICY platform_events_select ON platform_events
  FOR SELECT USING (is_account_member(account_id));

-- Inserts typically via service role / SECURITY DEFINER paths;
-- authenticated agents may also publish from the app.
CREATE POLICY platform_events_insert ON platform_events
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- ============================================================
-- 3. Optional link columns (nullable — gradual migration)
-- ============================================================
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id) ON DELETE SET NULL;

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id) ON DELETE SET NULL;
