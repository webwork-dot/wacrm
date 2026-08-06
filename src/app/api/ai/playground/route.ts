import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadAiConfig } from '@/lib/ai/config'
import { retrieveKnowledge } from '@/lib/ai/knowledge'
import { generateReply } from '@/lib/ai/generate'
import { buildSystemPrompt } from '@/lib/ai/defaults'
import { latestUserMessage } from '@/lib/ai/query'
import { AiError, type ChatMessage } from '@/lib/ai/types'
import {
  estimateConfidence,
  estimateTokenCostUsd,
} from '@/lib/ai/studio/profile'
import { listTools } from '@/lib/platform/tools/registry'

// Keep the tested transcript bounded, mirroring the live context window.
const MAX_TURNS = 20

/**
 * POST /api/ai/playground  (agent+)
 *
 * AI Studio Sandbox — same path as auto-reply, plus an execution
 * trace (prompt, retrieval, tools, latency, tokens, cost, confidence).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const limit = checkRateLimit(`ai-playground:${userId}`, RATE_LIMITS.aiDraft)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null
    if (!rawMessages) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 })
    }

    const messages: ChatMessage[] = rawMessages
      .filter(
        (m: unknown): m is ChatMessage =>
          !!m &&
          typeof m === 'object' &&
          ((m as ChatMessage).role === 'user' ||
            (m as ChatMessage).role === 'assistant') &&
          typeof (m as ChatMessage).content === 'string' &&
          (m as ChatMessage).content.trim().length > 0,
      )
      .slice(-MAX_TURNS)

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Send a message to test the agent.' },
        { status: 400 },
      )
    }

    const config = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    }).catch((err) => {
      console.error('[ai/playground] loadAiConfig error:', err)
      throw new AiError('Stored API key could not be decrypted.', {
        code: 'key_decrypt_failed',
        status: 400,
      })
    })
    if (!config) {
      return NextResponse.json(
        {
          error: 'No agent configured yet. Add your provider key in Setup.',
          code: 'ai_not_configured',
        },
        { status: 400 },
      )
    }

    const started = Date.now()
    const knowledge = await retrieveKnowledge(
      supabase,
      accountId,
      config,
      latestUserMessage(messages),
    )
    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })
    const latencyMs = Date.now() - started
    const toolsAvailable = listTools().map((t) => t.id)
    const confidence = estimateConfidence({
      handoff,
      retrievalCount: knowledge.length,
      replyLength: text.length,
    })
    const estimatedCost =
      usage != null
        ? estimateTokenCostUsd(
            config.provider,
            usage.promptTokens,
            usage.completionTokens,
          )
        : null

    const sandbox = {
      prompt_preview: systemPrompt.slice(0, 1200),
      retrieval: knowledge.map((k) => k.slice(0, 280)),
      tools: toolsAvailable,
      latency_ms: latencyMs,
      tokens: usage,
      estimated_cost_usd: estimatedCost,
      confidence,
    }

    // Best-effort durable trace (migration 043). Ignore missing table.
    void supabase
      .from('ai_execution_traces')
      .insert({
        account_id: accountId,
        source: 'sandbox',
        created_by: userId,
        payload: {
          ...sandbox,
          reply_excerpt: text.slice(0, 400),
          handoff,
          model: config.model,
          provider: config.provider,
        },
      })
      .then(({ error }) => {
        if (error && error.code !== '42P01') {
          console.warn('[ai/playground] trace insert:', error.message)
        }
      })

    return NextResponse.json({ reply: text, handoff, sandbox })
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      )
    }
    return toErrorResponse(err)
  }
}
