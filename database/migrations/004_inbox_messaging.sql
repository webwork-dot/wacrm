-- Inbox & messaging

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'resolved', 'closed', 'spam')),
  assigned_agent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  last_replied_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_customer_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  snoozed_until TIMESTAMPTZ,
  first_response_due_at TIMESTAMPTZ,
  next_response_due_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  first_responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  ai_autoreply_disabled BOOLEAN NOT NULL DEFAULT false,
  ai_reply_count INTEGER NOT NULL DEFAULT 0,
  ai_handoff_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations (contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_account ON public.conversations (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact
  ON public.conversations (account_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_customer_message_at
  ON public.conversations (last_customer_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_is_pinned
  ON public.conversations (is_pinned DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_is_starred
  ON public.conversations (is_starred)
  WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_conversations_snoozed_until
  ON public.conversations (snoozed_until)
  WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent
  ON public.conversations (assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_first_response_due
  ON public.conversations (first_response_due_at)
  WHERE first_response_due_at IS NOT NULL AND first_responded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_next_response_due
  ON public.conversations (next_response_due_at)
  WHERE next_response_due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
  sender_id UUID,
  content_type TEXT NOT NULL DEFAULT 'text'
    CHECK (content_type IN (
      'text', 'image', 'document', 'audio', 'video',
      'location', 'template', 'interactive'
    )),
  content_text TEXT,
  media_url TEXT,
  template_name TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
  reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  interactive_reply_id TEXT,
  interactive_payload JSONB,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON public.messages (message_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'agent')),
  actor_id UUID,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_reactions_message_id_actor_type_actor_id_key
    UNIQUE (message_id, actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation
  ON public.message_reactions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON public.message_reactions (message_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT,
  access_token TEXT NOT NULL,
  verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  subscribed_apps_at TIMESTAMPTZ,
  last_registration_error TEXT,
  connection_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT whatsapp_config_account_id_key UNIQUE (account_id),
  CONSTRAINT whatsapp_config_phone_number_id_key UNIQUE (phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_account ON public.whatsapp_config (account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_registered_at
  ON public.whatsapp_config (registered_at)
  WHERE registered_at IS NULL;

CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Marketing'
    CHECK (category IN ('Marketing', 'Utility', 'Authentication')),
  language TEXT DEFAULT 'en_US',
  header_type TEXT CHECK (header_type IN ('text', 'image', 'video', 'document')),
  header_content TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons JSONB,
  status TEXT DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT', 'PENDING', 'APPROVED', 'REJECTED',
      'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION'
    )),
  sample_values JSONB,
  meta_template_id TEXT,
  rejection_reason TEXT,
  quality_score TEXT CHECK (quality_score IS NULL OR quality_score IN ('GREEN', 'YELLOW', 'RED')),
  header_handle TEXT,
  header_media_url TEXT,
  submission_error TEXT,
  last_submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT message_templates_buttons_shape_check CHECK (
    buttons IS NULL
    OR (jsonb_typeof(buttons) = 'array' AND jsonb_array_length(buttons) <= 10)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS message_templates_user_name_language_key
  ON public.message_templates (user_id, name, language);
CREATE INDEX IF NOT EXISTS idx_message_templates_account ON public.message_templates (account_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_meta_template_id
  ON public.message_templates (meta_template_id)
  WHERE meta_template_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'interactive')),
  content_text TEXT,
  interactive_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_account ON public.quick_replies (account_id);

CREATE TABLE IF NOT EXISTS public.inbox_settings (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  first_response_minutes INTEGER NOT NULL DEFAULT 15 CHECK (first_response_minutes > 0),
  next_response_minutes INTEGER NOT NULL DEFAULT 60 CHECK (next_response_minutes > 0),
  resolution_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (resolution_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_watchers (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_watchers_user
  ON public.conversation_watchers (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_watchers_account
  ON public.conversation_watchers (account_id);

CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation
  ON public.conversation_notes (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.conversation_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation
  ON public.conversation_events (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_events_account
  ON public.conversation_events (account_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.conversations;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.whatsapp_config;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.message_templates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.quick_replies;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.inbox_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.inbox_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();
