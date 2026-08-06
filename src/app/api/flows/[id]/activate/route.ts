import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { compileAndPublish } from '@/lib/platform/automation/compiler'

/**
 * POST /api/flows/[id]/activate
 *
 * Body: { status: 'draft' | 'active' | 'archived' }
 *
 * Activating validates + compiles designer JSON into a versioned IR
 * snapshot and pins it on the flow. Runtime executes that IR only.
 *
 * Drafts and archives are unconditional — users need to be able to
 * save broken-work-in-progress and pause flows without first fixing them.
 *
 * Returns the updated flow on success; on validation/compile failure
 * returns the full issue list so the builder can highlight each problem.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  // Changing status (activate / draft / archive) is a write — the RLS
  // flows_update policy requires `agent`, but the service-role client
  // below bypasses RLS, so enforce the role here (a viewer passes the
  // membership-only ownership check).
  let accountId: string
  let userId: string
  try {
    const ctx = await requireRole('agent')
    accountId = ctx.accountId
    userId = ctx.userId
  } catch (err) {
    return toErrorResponse(err)
  }

  const supabase = await createClient()

  const body = (await request.json().catch(() => null)) as
    | { status?: 'draft' | 'active' | 'archived' }
    | null
  const status = body?.status
  if (!status || !['draft', 'active', 'archived'].includes(status)) {
    return NextResponse.json(
      { error: "status must be one of 'draft' | 'active' | 'archived'" },
      { status: 400 },
    )
  }

  // Ownership via RLS — caller's client, pinned to account.
  const { data: existing } = await supabase
    .from('flows')
    .select('id, account_id')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = supabaseAdmin()

  if (status === 'active') {
    // Compile designer → IR (includes validation). Refuse activate
    // without a pinned compiled version.
    const compiled = await compileAndPublish({
      flowId: id,
      accountId,
      compiledBy: userId,
    })
    if (!compiled.ok) {
      return NextResponse.json(
        {
          error: 'Cannot activate flow — fix the issues below first.',
          issues: compiled.issues,
        },
        { status: 422 },
      )
    }
  }

  const { data: updated, error } = await admin
    .from('flows')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('account_id', accountId)
    .select()
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ flow: updated })
}
