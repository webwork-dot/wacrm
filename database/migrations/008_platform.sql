-- Platform layer: plans, connections, API keys, notifications, permissions

CREATE TABLE IF NOT EXISTS public.software_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  entitlements JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_plan_id_fkey'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.software_plans(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_plan_id ON public.accounts (plan_id);

CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('healthy', 'degraded', 'error', 'unknown', 'disconnected')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  secrets_encrypted TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  latency_ms INTEGER,
  expires_at TIMESTAMPTZ,
  provider_mode TEXT NOT NULL DEFAULT 'client_owned'
    CHECK (provider_mode IN ('client_owned', 'platform_managed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT connections_account_id_type_name_key UNIQUE (account_id, type, name)
);

CREATE INDEX IF NOT EXISTS idx_connections_account ON public.connections (account_id);
CREATE INDEX IF NOT EXISTS idx_connections_account_type ON public.connections (account_id, type);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_config_connection_id_fkey'
  ) THEN
    ALTER TABLE public.whatsapp_config
      ADD CONSTRAINT whatsapp_config_connection_id_fkey
      FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_configs_connection_id_fkey'
  ) THEN
    ALTER TABLE public.ai_configs
      ADD CONSTRAINT ai_configs_connection_id_fkey
      FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_account_created
  ON public.platform_events (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_type
  ON public.platform_events (account_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'message.outbound', 'broadcast.recipient', 'automation.run', 'flow.run',
    'ai.draft', 'ai.auto_reply', 'api.request', 'other'
  )),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_account_created
  ON public.usage_events (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_account_type_created
  ON public.usage_events (account_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON public.api_keys (account_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON public.api_keys (key_hash);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_delivery_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_endpoints_account_id_idx
  ON public.webhook_endpoints (account_id);

CREATE TABLE IF NOT EXISTS public.member_presence (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_presence_account_idx ON public.member_presence (account_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'conversation_assigned'
    CHECK (type IN (
      'conversation_assigned', 'mention', 'new_message', 'ai_completed',
      'campaign_completed', 'conversation_resolved', 'message_failed'
    )),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.platform_users (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  platform_role public.platform_role_enum NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.permissions (
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  surface TEXT NOT NULL CHECK (surface IN ('platform', 'client', 'both'))
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_role public.platform_role_enum,
  account_role public.account_role_enum,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  CHECK (
    (platform_role IS NOT NULL AND account_role IS NULL)
    OR (platform_role IS NULL AND account_role IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_platform
  ON public.role_permissions (platform_role, permission_key)
  WHERE platform_role IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_account
  ON public.role_permissions (account_role, permission_key)
  WHERE account_role IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_key_account_id_key
  ON public.feature_flags (key, account_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags (key);

CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_impersonation_active
  ON public.impersonation_sessions (platform_user_id, ended_at)
  WHERE ended_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.software_plans;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.software_plans
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.connections;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.record_webhook_failure(
  endpoint_id UUID,
  max_failures INT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE webhook_endpoints
  SET failure_count = failure_count + 1,
      is_active = CASE
        WHEN failure_count + 1 >= max_failures THEN false
        ELSE is_active
      END
  WHERE id = endpoint_id;
$$;

CREATE OR REPLACE FUNCTION public.touch_presence(
  p_status TEXT DEFAULT 'online'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('online', 'away') THEN
    RAISE EXCEPTION 'Invalid presence status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT account_id INTO v_account_id
  FROM profiles
  WHERE user_id = v_user_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No account for caller' USING ERRCODE = '22023';
  END IF;

  INSERT INTO member_presence (user_id, account_id, status, last_seen_at)
  VALUES (v_user_id, v_account_id, p_status, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET status = EXCLUDED.status,
        last_seen_at = NOW(),
        account_id = EXCLUDED.account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_inbox_notification(
  p_account_id UUID,
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_caller UUID;
BEGIN
  v_caller := nullif(current_setting('app.current_user_id', true), '')::uuid;
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT is_account_member(p_account_id, 'agent') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id = v_caller AND p_type = 'mention' THEN
    RETURN NULL;
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, title, body,
    conversation_id, contact_id, actor_user_id
  ) VALUES (
    p_account_id, p_user_id, p_type, p_title, p_body,
    p_conversation_id, p_contact_id, v_caller
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
