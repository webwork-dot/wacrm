import { NextResponse } from 'next/server'
import { dbAdmin as createAdminClient } from '@/lib/db/client';
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * GET/POST /api/ai/schema/apply
 *
 * Probes whether legacy AI reply polish columns/tables are present.
 * New installs get these via `database/migrations` — this route is a
 * diagnostic for upgraded databases. POST matches GET for the Settings UI.
 */

export const MIGRATION_033_SQL = `-- 033_ai_reply_polish.sql (idempotent)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS handoff_agent_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_handoff_summary text;

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,
  mode              text NOT NULL CHECK (mode IN ('auto_reply', 'draft')),
  provider          text NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model             text NOT NULL,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens      integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_account_created
  ON ai_usage_log(account_id, created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_log_select ON ai_usage_log;
CREATE POLICY ai_usage_log_select ON ai_usage_log FOR SELECT
  USING (is_account_member(account_id, 'admin'));
`

function isMissingRelationOrColumn(err: {
  code?: string
  message?: string
} | null): boolean {
  if (!err) return false
  return (
    err.code === '42703' ||
    err.code === '42P01' ||
    /does not exist/i.test(err.message ?? '')
  )
}

async function probeSchema(): Promise<{
  needsMigration: boolean
  missing: string[]
}> {
  const admin = createAdminClient()
  const missing: string[] = []

  const { error: handoffErr } = await admin
    .from('ai_configs')
    .select('handoff_agent_id')
    .limit(1)
  if (isMissingRelationOrColumn(handoffErr)) {
    missing.push('ai_configs.handoff_agent_id')
  }

  const { error: genErr } = await admin
    .from('messages')
    .select('ai_generated')
    .limit(1)
  if (isMissingRelationOrColumn(genErr)) {
    missing.push('messages.ai_generated')
  }

  const { error: summaryErr } = await admin
    .from('conversations')
    .select('ai_handoff_summary')
    .limit(1)
  if (isMissingRelationOrColumn(summaryErr)) {
    missing.push('conversations.ai_handoff_summary')
  }

  const { error: usageErr } = await admin.from('ai_usage_log').select('id').limit(1)
  if (isMissingRelationOrColumn(usageErr)) {
    missing.push('ai_usage_log')
  }

  return { needsMigration: missing.length > 0, missing }
}

async function handle() {
  const probe = await probeSchema()
  return NextResponse.json({
    ...probe,
    sql: MIGRATION_033_SQL,
    instructions:
      'If needsMigration is true, run npm run db:migrate (or apply sql via psql), then reload Settings → AI.',
  })
}

export async function GET() {
  try {
    await requireRole('admin')
    return await handle()
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST() {
  try {
    await requireRole('admin')
    return await handle()
  } catch (err) {
    return toErrorResponse(err)
  }
}
