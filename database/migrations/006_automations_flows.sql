-- Automations & conversational flows

CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_user_id ON public.automations (user_id);
CREATE INDEX IF NOT EXISTS idx_automations_account ON public.automations (account_id);
CREATE INDEX IF NOT EXISTS idx_automations_active_trigger
  ON public.automations (trigger_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_automations_account_active_trigger
  ON public.automations (account_id, trigger_type) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.automation_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES public.automation_steps(id) ON DELETE CASCADE,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  step_type TEXT NOT NULL,
  step_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_automation_id
  ON public.automation_steps (automation_id, position);
CREATE INDEX IF NOT EXISTS idx_automation_steps_parent
  ON public.automation_steps (parent_step_id) WHERE parent_step_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  trigger_event TEXT NOT NULL,
  steps_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
  ON public.automation_logs (automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON public.automation_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_account ON public.automation_logs (account_id);

CREATE TABLE IF NOT EXISTS public.automation_pending_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  log_id UUID REFERENCES public.automation_logs(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES public.automation_steps(id) ON DELETE SET NULL,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  next_step_position INTEGER NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_pending_due
  ON public.automation_pending_executions (run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_pending_account
  ON public.automation_pending_executions (account_id);

CREATE TABLE IF NOT EXISTS public.flows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('keyword', 'first_inbound_message', 'manual')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  entry_node_id TEXT,
  fallback_policy JSONB NOT NULL DEFAULT
    '{"on_unknown_reply":"reprompt","max_reprompts":2,"on_timeout_hours":24,"on_exhaust":"handoff"}'::jsonb,
  active_compiled_version_id UUID,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flows_active_trigger
  ON public.flows (user_id, trigger_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_flows_account ON public.flows (account_id);
CREATE INDEX IF NOT EXISTS idx_flows_account_active
  ON public.flows (account_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.flow_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN (
    'start', 'send_buttons', 'send_list', 'send_message', 'send_media',
    'collect_input', 'condition', 'set_tag', 'handoff', 'http_fetch', 'end'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flow_nodes_flow_id_node_key_key UNIQUE (flow_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow ON public.flow_nodes (flow_id);

CREATE TABLE IF NOT EXISTS public.flow_compiled_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  ir JSONB NOT NULL,
  compiler_version TEXT NOT NULL DEFAULT '1',
  compiled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flow_compiled_versions_flow_id_version_key UNIQUE (flow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_flow_compiled_versions_flow
  ON public.flow_compiled_versions (flow_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_flow_compiled_versions_account
  ON public.flow_compiled_versions (account_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flows_active_compiled_version_id_fkey'
  ) THEN
    ALTER TABLE public.flows
      ADD CONSTRAINT flows_active_compiled_version_id_fkey
      FOREIGN KEY (active_compiled_version_id)
      REFERENCES public.flow_compiled_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.flow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  compiled_version_id UUID REFERENCES public.flow_compiled_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'queued', 'waiting', 'completed', 'handed_off',
    'timed_out', 'paused_by_agent', 'failed', 'cancelled'
  )),
  current_node_key TEXT,
  last_prompt_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  reprompt_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_advanced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact
  ON public.flow_runs (account_id, contact_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_inflight_run_per_contact
  ON public.flow_runs (account_id, contact_id)
  WHERE status IN ('active', 'queued', 'waiting');

CREATE INDEX IF NOT EXISTS idx_flow_runs_active_advanced
  ON public.flow_runs (last_advanced_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_started
  ON public.flow_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_runs_account ON public.flow_runs (account_id);
CREATE INDEX IF NOT EXISTS idx_flow_runs_compiled_version
  ON public.flow_runs (compiled_version_id)
  WHERE compiled_version_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.flow_run_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_run_id UUID NOT NULL REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'started', 'node_entered', 'message_sent', 'reply_received',
    'fallback_fired', 'handoff', 'timeout', 'error', 'completed'
  )),
  node_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_run_events_run_type
  ON public.flow_run_events (flow_run_id, event_type);
CREATE INDEX IF NOT EXISTS idx_flow_run_events_run_time
  ON public.flow_run_events (flow_run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.automation_job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.flows(id) ON DELETE CASCADE,
  flow_run_id UUID REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('advance', 'retry_node', 'timeout_check')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled')),
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_job_queue_due
  ON public.automation_job_queue (run_after) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_job_queue_account
  ON public.automation_job_queue (account_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.automations;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.flows;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.flows
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.automation_job_queue;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.automation_job_queue
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();
