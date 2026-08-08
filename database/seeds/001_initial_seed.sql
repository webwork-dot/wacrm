-- ============================================================
-- 001_initial_seed.sql — Platform catalog only (no clients)
-- ============================================================

-- Platform settings
INSERT INTO platform_settings (key, value) VALUES
  ('app.name', '"Convexa"'::jsonb),
  ('app.locale_default', '"en"'::jsonb),
  ('app.timezone_default', '"Asia/Kolkata"'::jsonb),
  ('install.version', '"1.0.0"'::jsonb),
  ('install.initialized_at', to_jsonb(NOW()::text))
ON CONFLICT (key) DO NOTHING;

-- Permissions catalog
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

-- Platform role grants
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

-- Global feature flags
INSERT INTO feature_flags (key, enabled, account_id, description) VALUES
  ('broadcasts', true, NULL, 'WhatsApp broadcast campaigns'),
  ('automations', true, NULL, 'Automation Studio'),
  ('flows', true, NULL, 'Flow / chatbot builder'),
  ('ai_studio', true, NULL, 'AI Studio'),
  ('knowledge_hub', true, NULL, 'Knowledge Hub / RAG'),
  ('pipelines', true, NULL, 'Sales pipelines'),
  ('api_access', true, NULL, 'Public API keys'),
  ('webhooks', true, NULL, 'Outbound webhooks')
ON CONFLICT DO NOTHING;

-- Software plans (catalog only — not assigned to clients)
INSERT INTO software_plans (slug, name, description, limits, entitlements, sort_order, is_active)
VALUES
  (
    'free',
    'Free',
    'Getting started',
    '{"seats":1,"messages_per_month":500,"ai_auto_replies_per_month":50}'::jsonb,
    '{"broadcasts":true,"automations":false,"ai_studio":false}'::jsonb,
    10,
    true
  ),
  (
    'starter',
    'Starter',
    'For small teams',
    '{"seats":5,"messages_per_month":5000,"ai_auto_replies_per_month":500}'::jsonb,
    '{"broadcasts":true,"automations":true,"ai_studio":true}'::jsonb,
    20,
    true
  ),
  (
    'growth',
    'Growth',
    'Growing businesses',
    '{"seats":20,"messages_per_month":50000,"ai_auto_replies_per_month":5000}'::jsonb,
    '{"broadcasts":true,"automations":true,"ai_studio":true,"api_access":true}'::jsonb,
    30,
    true
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom limits',
    '{"seats":-1,"messages_per_month":-1,"ai_auto_replies_per_month":-1}'::jsonb,
    '{"broadcasts":true,"automations":true,"ai_studio":true,"api_access":true,"webhooks":true}'::jsonb,
    40,
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- Connection type registry (metadata in platform_settings)
INSERT INTO platform_settings (key, value) VALUES
  (
    'connection.types',
    '[
      {"type":"whatsapp_cloud","label":"WhatsApp Cloud API","category":"messaging"},
      {"type":"openai","label":"OpenAI","category":"ai"},
      {"type":"anthropic","label":"Anthropic","category":"ai"}
    ]'::jsonb
  ),
  (
    'notification.channels',
    '["in_app","email"]'::jsonb
  ),
  (
    'catalog.countries',
    '["IN","US","GB","AE","SG","AU"]'::jsonb
  ),
  (
    'catalog.languages',
    '["en","hi","ar","ko"]'::jsonb
  ),
  (
    'catalog.timezones',
    '["Asia/Kolkata","UTC","America/New_York","Europe/London","Asia/Dubai","Asia/Singapore"]'::jsonb
  ),
  (
    'starter_kits',
    '[{"slug":"whatsapp-inbox","name":"WhatsApp Inbox","description":"Shared team inbox"},{"slug":"broadcast-starter","name":"Broadcast Starter","description":"Campaign basics"}]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

-- System message template placeholders (account_id NULL not supported on message_templates —
-- store as settings until clients create their own)
INSERT INTO platform_settings (key, value) VALUES
  (
    'system.templates',
    '[
      {"name":"hello_world","language":"en","category":"UTILITY","body":"Hello {{1}}, welcome to Convexa."},
      {"name":"order_update","language":"en","category":"UTILITY","body":"Hi {{1}}, your order {{2}} is {{3}}."}
    ]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
