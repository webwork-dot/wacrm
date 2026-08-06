-- ============================================================
-- Automation Runtime — Compiler → IR → Queue → History
--
-- Wave C1 (Convexa platform core):
--   Active automations execute compiled IR only — never live
--   designer JSON from flow_nodes. Publishing / activating
--   freezes a versioned snapshot; runs pin that version so
--   mid-flight edits cannot change behaviour.
--
-- Tables:
--   flow_compiled_versions — immutable IR per publish
--   automation_job_queue   — delayed / retry work
-- Columns:
--   flows.active_compiled_version_id
--   flow_runs.compiled_version_id
--   widened flow_runs.status (+ queued, waiting, cancelled)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Compiled IR versions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flow_compiled_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  -- Immutable Intermediate Representation. Shape owned by
  -- src/lib/platform/automation/compiler.ts (schema_version field).
  ir JSONB NOT NULL,
  compiler_version TEXT NOT NULL DEFAULT '1',
  compiled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_flow_compiled_versions_flow
  ON flow_compiled_versions (flow_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_flow_compiled_versions_account
  ON flow_compiled_versions (account_id, created_at DESC);

ALTER TABLE flow_compiled_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read compiled versions" ON flow_compiled_versions;
CREATE POLICY "Members read compiled versions"
  ON flow_compiled_versions FOR SELECT
  USING (is_account_member(account_id));

-- ------------------------------------------------------------
-- 2. Pin active IR on flows + runs
-- ------------------------------------------------------------
ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS active_compiled_version_id UUID
    REFERENCES flow_compiled_versions(id) ON DELETE SET NULL;

ALTER TABLE flow_runs
  ADD COLUMN IF NOT EXISTS compiled_version_id UUID
    REFERENCES flow_compiled_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flow_runs_compiled_version
  ON flow_runs (compiled_version_id)
  WHERE compiled_version_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Widen run status for queue / cancel
-- ------------------------------------------------------------
ALTER TABLE flow_runs DROP CONSTRAINT IF EXISTS flow_runs_status_check;
ALTER TABLE flow_runs
  ADD CONSTRAINT flow_runs_status_check
  CHECK (status IN (
    'active',
    'queued',
    'waiting',
    'completed',
    'handed_off',
    'timed_out',
    'paused_by_agent',
    'failed',
    'cancelled'
  ));

-- One active OR waiting OR queued run per contact (extends the
-- account-scoped uniqueness from migration 017).
DROP INDEX IF EXISTS idx_one_inflight_run_per_contact;
CREATE UNIQUE INDEX idx_one_inflight_run_per_contact
  ON flow_runs (account_id, contact_id)
  WHERE status IN ('active', 'queued', 'waiting');

-- Keep legacy active-only index for older code paths that filter
-- status='active' only; both can coexist.
-- idx_one_active_run_per_contact remains from 017.

-- ------------------------------------------------------------
-- 4. Job queue (delayed advance / retries)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES flows(id) ON DELETE CASCADE,
  flow_run_id UUID REFERENCES flow_runs(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'advance',
    'retry_node',
    'timeout_check'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'done', 'failed', 'cancelled'
  )),
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_job_queue_due
  ON automation_job_queue (run_after)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_job_queue_account
  ON automation_job_queue (account_id, created_at DESC);

ALTER TABLE automation_job_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read automation jobs" ON automation_job_queue;
CREATE POLICY "Members read automation jobs"
  ON automation_job_queue FOR SELECT
  USING (is_account_member(account_id));
