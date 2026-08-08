-- Pipelines, deals, broadcasts

CREATE TABLE IF NOT EXISTS public.pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_account ON public.pipelines (account_id);

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON public.pipeline_stages (pipeline_id);

CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  expected_close_date DATE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON public.deals (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals (stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_account ON public.deals (account_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON public.deals (assigned_to);

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'en_US',
  template_variables JSONB,
  audience_filter JSONB,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_account ON public.broadcasts (account_id);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  whatsapp_message_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON public.broadcast_recipients (broadcast_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_wamid
  ON public.broadcast_recipients (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast_status
  ON public.broadcast_recipients (broadcast_id, status);

DROP TRIGGER IF EXISTS set_updated_at ON public.deals;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.broadcasts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();
