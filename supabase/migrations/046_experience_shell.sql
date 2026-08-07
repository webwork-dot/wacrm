-- ============================================================
-- 046_experience_shell.sql — Product Experience Shell (rest)
--
-- Requires 045 committed first (`manager` on account_role_enum).
-- platform_users, Permission Engine, flags, branding, impersonation.
-- Idempotent. Does NOT invent new product modules.
-- ============================================================

-- Rank: owner=5, admin=4, manager=3, agent=2, viewer=1
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'   THEN 5
            WHEN 'admin'   THEN 4
            WHEN 'manager' THEN 3
            WHEN 'agent'   THEN 2
            WHEN 'viewer'  THEN 1
            ELSE 0
          END
        >=
          CASE min_role
            WHEN 'owner'   THEN 5
            WHEN 'admin'   THEN 4
            WHEN 'manager' THEN 3
            WHEN 'agent'   THEN 2
            WHEN 'viewer'  THEN 1
            ELSE 0
          END
  );
$$;

-- ------------------------------------------------------------
-- 1. Platform users (DB-backed after email bootstrap)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_role_enum') THEN
    CREATE TYPE platform_role_enum AS ENUM ('owner', 'admin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_role platform_role_enum NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform users self-read" ON platform_users;
CREATE POLICY "Platform users self-read"
  ON platform_users FOR SELECT
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. Permission catalog + role grants
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  surface TEXT NOT NULL CHECK (surface IN ('platform', 'client', 'both'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of platform_role / account_role is set
  platform_role platform_role_enum,
  account_role account_role_enum,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  CHECK (
    (platform_role IS NOT NULL AND account_role IS NULL)
    OR (platform_role IS NULL AND account_role IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_platform
  ON role_permissions (platform_role, permission_key)
  WHERE platform_role IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_account
  ON role_permissions (account_role, permission_key)
  WHERE account_role IS NOT NULL;

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read permissions" ON permissions;
CREATE POLICY "Authenticated read permissions"
  ON permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated read role_permissions" ON role_permissions;
CREATE POLICY "Authenticated read role_permissions"
  ON role_permissions FOR SELECT TO authenticated USING (true);

INSERT INTO permissions (key, description, surface) VALUES
  ('platform.console.access', 'Access Platform Console', 'platform'),
  ('platform.clients.read', 'View clients', 'platform'),
  ('platform.clients.write', 'Suspend/activate/edit clients', 'platform'),
  ('platform.impersonate', 'View as client', 'platform'),
  ('platform.plans.read', 'View software plans', 'platform'),
  ('platform.plans.assign', 'Assign plans to clients', 'platform'),
  ('platform.settings.write', 'Edit platform settings and flags', 'platform'),
  ('platform.activity.read', 'Read platform activity', 'platform'),
  ('client.dashboard.access', 'Client dashboard', 'client'),
  ('client.inbox.access', 'Inbox', 'client'),
  ('client.contacts.access', 'Contacts', 'client'),
  ('client.broadcasts.access', 'Broadcasts', 'client'),
  ('client.automations.access', 'Automation Studio', 'client'),
  ('client.ai.access', 'AI Studio', 'client'),
  ('client.knowledge.access', 'Knowledge Hub', 'client'),
  ('client.reports.access', 'Reports', 'client'),
  ('client.settings.view', 'View settings', 'client'),
  ('client.settings.edit', 'Edit workspace settings', 'client'),
  ('client.members.manage', 'Manage team members', 'client'),
  ('client.messages.send', 'Send messages', 'client')
ON CONFLICT (key) DO NOTHING;

-- Platform owner + admin get all platform perms
INSERT INTO role_permissions (platform_role, permission_key)
SELECT r.role, p.key
FROM (VALUES ('owner'::platform_role_enum), ('admin'::platform_role_enum)) AS r(role)
CROSS JOIN permissions p
WHERE p.surface IN ('platform', 'both')
ON CONFLICT DO NOTHING;

-- Client role grants
INSERT INTO role_permissions (account_role, permission_key)
SELECT 'owner'::account_role_enum, key FROM permissions WHERE surface IN ('client', 'both')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (account_role, permission_key)
SELECT 'admin'::account_role_enum, key FROM permissions WHERE surface IN ('client', 'both')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (account_role, permission_key)
SELECT 'manager'::account_role_enum, key FROM permissions
WHERE key IN (
  'client.dashboard.access','client.inbox.access','client.contacts.access',
  'client.broadcasts.access','client.automations.access','client.ai.access',
  'client.knowledge.access','client.reports.access','client.settings.view',
  'client.messages.send'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (account_role, permission_key)
SELECT 'agent'::account_role_enum, key FROM permissions
WHERE key IN (
  'client.dashboard.access','client.inbox.access','client.contacts.access',
  'client.broadcasts.access','client.automations.access','client.ai.access',
  'client.knowledge.access','client.reports.access','client.settings.view',
  'client.messages.send'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (account_role, permission_key)
SELECT 'viewer'::account_role_enum, key FROM permissions
WHERE key IN (
  'client.dashboard.access','client.inbox.access','client.contacts.access',
  'client.reports.access','client.settings.view'
)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3. Feature flags
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (key, account_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags (key);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read feature flags" ON feature_flags;
CREATE POLICY "Members read feature flags"
  ON feature_flags FOR SELECT TO authenticated
  USING (
    account_id IS NULL
    OR is_account_member(account_id)
  );

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('broadcasts', true, 'Broadcasts module'),
  ('automations', true, 'Automation Studio'),
  ('ai_studio', true, 'AI Studio'),
  ('knowledge_hub', true, 'Knowledge Hub'),
  ('starter_kits', true, 'Starter Kits'),
  ('api_keys', true, 'API keys settings'),
  ('reports', true, 'Reports'),
  ('onboarding', true, 'Guided onboarding')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 4. Account branding
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ------------------------------------------------------------
-- 5. Impersonation sessions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_impersonation_active
  ON impersonation_sessions (platform_user_id, ended_at)
  WHERE ended_at IS NULL;

ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
-- Service-role writes; no client policies needed for Wave 1.
