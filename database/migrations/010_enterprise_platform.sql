-- ============================================================
-- 010_enterprise_platform.sql
-- Additive only. Does NOT redesign existing tables.
-- Auth sessions, files, audit/activity, jobs, branding,
-- onboarding, health, soft-delete columns, AI embedding_status.
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- Auth: lockout + sessions + login history + password resets
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  remember_me BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON public.user_sessions (user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON public.user_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_created
  ON public.login_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_email_created
  ON public.login_history (email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user
  ON public.password_reset_tokens (user_id)
  WHERE used_at IS NULL;

-- ------------------------------------------------------------
-- Universal file storage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  driver TEXT NOT NULL CHECK (driver IN ('local', 'minio', 's3', 'r2', 'custom')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.storage_providers(id) ON DELETE SET NULL,
  bucket TEXT,
  object_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  checksum TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_account ON public.files (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON public.files (uploaded_by);

CREATE TABLE IF NOT EXISTS public.file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes BIGINT,
  checksum TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, version)
);

-- ------------------------------------------------------------
-- Audit logs (immutable) + activity feed
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_account_created
  ON public.audit_logs (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module_action
  ON public.audit_logs (module, action, created_at DESC);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_account_created
  ON public.activity_logs (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event
  ON public.activity_logs (event_type, created_at DESC);

-- ------------------------------------------------------------
-- Scheduled jobs + generic job queue (keep automation_job_queue)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  cron_expr TEXT,
  run_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next
  ON public.scheduled_jobs (next_run_at)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  queue TEXT NOT NULL DEFAULT 'default',
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'retrying')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_poll
  ON public.jobs (status, run_after, priority DESC)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_jobs_account ON public.jobs (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON public.jobs (job_type, status);

-- ------------------------------------------------------------
-- Workspace branding (white-label ready)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_branding (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  logo_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  favicon_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  company_name TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  language TEXT NOT NULL DEFAULT 'en',
  business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_footer TEXT,
  support_email TEXT,
  support_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Client onboarding checklist
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_onboarding (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  checklist JSONB NOT NULL DEFAULT '{
    "connect_whatsapp": false,
    "connect_ai": false,
    "upload_knowledge": false,
    "invite_team": false,
    "create_automation": false,
    "send_test_message": false,
    "first_broadcast": false
  }'::jsonb,
  current_step TEXT,
  completion_pct INTEGER NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- System health snapshots
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'warning', 'critical', 'unknown')),
  message TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_health_component_checked
  ON public.system_health (component, checked_at DESC);

-- ------------------------------------------------------------
-- Connections expansion (additive columns only)
-- ------------------------------------------------------------
ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS connection_type TEXT,
  ADD COLUMN IF NOT EXISTS credential_type TEXT,
  ADD COLUMN IF NOT EXISTS health TEXT DEFAULT 'unknown'
    CHECK (health IS NULL OR health IN ('healthy', 'warning', 'critical', 'unknown')),
  ADD COLUMN IF NOT EXISTS reconnect_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_connections_provider
  ON public.connections (account_id, provider);

-- ------------------------------------------------------------
-- AI embedding status (additive)
-- ------------------------------------------------------------
ALTER TABLE public.ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (embedding_status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED'));

ALTER TABLE public.ai_knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (embedding_status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED'));

CREATE INDEX IF NOT EXISTS idx_ai_docs_embedding_status
  ON public.ai_knowledge_documents (account_id, embedding_status);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_status
  ON public.ai_knowledge_chunks (account_id, embedding_status);

-- ------------------------------------------------------------
-- Soft-delete strategy (additive columns on key tenant tables)
-- Audit logs intentionally excluded (immutable).
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'contacts', 'conversations', 'messages', 'broadcasts',
    'automations', 'flows', 'ai_knowledge_documents', 'notifications',
    'api_keys', 'webhook_endpoints', 'connections'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
      t
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL',
      t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Production indexes (account_id / created_at / status hot paths)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contacts_account_created
  ON public.contacts (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_account_updated
  ON public.conversations (account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created
  ON public.messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_account_status
  ON public.broadcasts (account_id, status);
CREATE INDEX IF NOT EXISTS idx_automations_account_active
  ON public.automations (account_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flows_account_status
  ON public.flows (account_id, status);

-- Default local storage provider
INSERT INTO public.storage_providers (key, driver, config, is_default, is_active)
VALUES (
  'local',
  'local',
  '{"root":"storage/uploads"}'::jsonb,
  true,
  true
)
ON CONFLICT (key) DO NOTHING;

-- Auth lockout setting
INSERT INTO public.platform_settings (key, value) VALUES
  ('auth.max_failed_logins', '5'::jsonb),
  ('auth.lockout_minutes', '15'::jsonb),
  ('auth.session_days', '7'::jsonb),
  ('auth.session_days_remember', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;
