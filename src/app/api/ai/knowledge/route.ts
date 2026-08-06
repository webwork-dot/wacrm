import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadEmbeddingsKey } from '@/lib/ai/config'
import { ingestDocument } from '@/lib/ai/knowledge'
import { AiError } from '@/lib/ai/types'

/**
 * GET /api/ai/knowledge
 *
 * List the account's knowledge-base documents (any member).
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('ai_knowledge_documents')
      .select(
        'id, title, updated_at, source_type, sync_status, last_synced_at, sync_error, version, source_url',
      )
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
    if (error) {
      // Pre-043: fall back to basic columns
      if (error.code === '42703' || /does not exist/i.test(error.message)) {
        const legacy = await supabase
          .from('ai_knowledge_documents')
          .select('id, title, updated_at')
          .eq('account_id', accountId)
          .order('updated_at', { ascending: false })
        if (legacy.error) {
          console.error('[ai/knowledge GET] error:', legacy.error)
          return NextResponse.json(
            { error: 'Failed to load knowledge base' },
            { status: 500 },
          )
        }
        return NextResponse.json({ documents: legacy.data ?? [] })
      }
      console.error('[ai/knowledge GET] error:', error)
      return NextResponse.json(
        { error: 'Failed to load knowledge base' },
        { status: 500 },
      )
    }

    const docs = data ?? []
    const ids = docs.map((d) => d.id)
    let chunkCounts: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: chunks } = await supabase
        .from('ai_knowledge_chunks')
        .select('document_id')
        .in('document_id', ids)
      for (const row of chunks ?? []) {
        const id = (row as { document_id: string }).document_id
        chunkCounts[id] = (chunkCounts[id] ?? 0) + 1
      }
    }

    return NextResponse.json({
      documents: docs.map((d) => ({
        ...d,
        chunk_count: chunkCounts[d.id] ?? 0,
      })),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST /api/ai/knowledge  (admin+)
 *
 * Create a document, then chunk + (optionally) embed it. If indexing
 * fails the document is still saved so the admin can retry via reindex.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const limit = checkRateLimit(`ai-kb:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const content = typeof body?.content === 'string' ? body.content.trim() : ''
    const sourceType =
      body?.source_type === 'faq' ||
      body?.source_type === 'pdf' ||
      body?.source_type === 'website'
        ? body.source_type
        : 'manual'
    const sourceUrl =
      typeof body?.source_url === 'string' && body.source_url.trim()
        ? body.source_url.trim()
        : null
    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 },
      )
    }

    let doc: { id: string } | null = null
    let insertError: { message: string; code?: string } | null = null
    {
      const res = await supabase
        .from('ai_knowledge_documents')
        .insert({
          account_id: accountId,
          created_by: userId,
          title,
          content,
          source_type: sourceType,
          source_url: sourceUrl,
          sync_status: 'syncing',
          version: 1,
        })
        .select('id')
        .single()
      doc = res.data
      insertError = res.error
    }
    if (insertError && (insertError.code === '42703' || /does not exist/i.test(insertError.message))) {
      const res = await supabase
        .from('ai_knowledge_documents')
        .insert({ account_id: accountId, created_by: userId, title, content })
        .select('id')
        .single()
      doc = res.data
      insertError = res.error
    }
    if (insertError || !doc) {
      console.error('[ai/knowledge POST] insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save document' },
        { status: 500 },
      )
    }

    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      supabase,
      accountId,
    )
    try {
      await ingestDocument(
        supabase,
        accountId,
        { embeddingsApiKey },
        doc.id,
        content,
      )
      await supabase
        .from('ai_knowledge_documents')
        .update({
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          sync_error: null,
        })
        .eq('id', doc.id)
    } catch (err) {
      const message = err instanceof AiError ? err.message : 'indexing failed'
      console.error('[ai/knowledge POST] ingest error:', err)
      await supabase
        .from('ai_knowledge_documents')
        .update({
          sync_status: 'error',
          sync_error: message,
        })
        .eq('id', doc.id)
      return NextResponse.json(
        {
          success: true,
          id: doc.id,
          warning: `Saved, but semantic indexing failed (${message}). Lexical search still works; use Reindex to retry.`,
        },
        { status: 200 },
      )
    }

    if (corrupt) {
      return NextResponse.json({
        success: true,
        id: doc.id,
        warning:
          'Saved with keyword search only — your embeddings key could not be decrypted (check ENCRYPTION_KEY, then re-enter the key).',
      })
    }
    return NextResponse.json({ success: true, id: doc.id })
  } catch (err) {
    return toErrorResponse(err)
  }
}
