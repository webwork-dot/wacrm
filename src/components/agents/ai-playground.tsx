'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Bot,
  RotateCcw,
  Send,
  Loader2,
  UserCircle2,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SandboxTrace {
  prompt_preview?: string;
  retrieval?: string[];
  tools?: string[];
  latency_ms?: number;
  tokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  estimated_cost_usd?: number | null;
  confidence?: number;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  handoff?: boolean;
  sandbox?: SandboxTrace;
}

export function AiPlayground({ onGoToSetup }: { onGoToSetup?: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTrace, setLastTrace] = useState<SandboxTrace | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'ai_not_configured') {
          toast.error('No agent configured yet — finish Setup first.');
        } else {
          toast.error(data.error ?? "Couldn't get a reply.");
        }
        setTurns(turns);
        setInput(text);
        return;
      }
      const sandbox = (data.sandbox as SandboxTrace | undefined) ?? null;
      setLastTrace(sandbox);
      setTurns([
        ...next,
        {
          role: 'assistant',
          content:
            typeof data.reply === 'string' && data.reply.trim()
              ? data.reply
              : '',
          handoff: Boolean(data.handoff),
          sandbox: sandbox ?? undefined,
        },
      ]);
    } catch {
      toast.error("Couldn't reach the agent.");
      setTurns(turns);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="flex h-[60vh] min-h-[420px] flex-col rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Sandbox</span>
            <span className="text-xs text-muted-foreground">
              — test replies as if you were a customer
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTurns([]);
              setLastTrace(null);
            }}
            disabled={turns.length === 0 || sending}
            className="text-muted-foreground"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Bot className="mb-2 h-8 w-8 text-muted-foreground/60" />
              <p>Send a message to see how your agent would reply.</p>
              <p className="mt-1 text-xs">
                Uses your knowledge base and the same path as auto-reply —
                including handoff.
              </p>
              {onGoToSetup && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={onGoToSetup}
                  className="mt-1 h-auto p-0 text-xs"
                >
                  Not set up yet? Go to Setup{' '}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              )}
            </div>
          )}

          {turns.map((t, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-2',
                t.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              {t.role === 'assistant' && (
                <Bot className="mt-1 h-5 w-5 shrink-0 text-primary" />
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                  t.role === 'user'
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground',
                )}
              >
                {t.content && (
                  <p className="whitespace-pre-wrap">{t.content}</p>
                )}
                {t.role === 'assistant' && t.handoff && (
                  <p
                    className={cn(
                      'flex items-center gap-1 text-xs text-amber-500',
                      t.content && 'mt-1.5 border-t border-border/50 pt-1.5',
                    )}
                  >
                    <UserCircle2 className="h-3.5 w-3.5" />
                    Would hand off to a human here
                  </p>
                )}
              </div>
              {t.role === 'user' && (
                <UserCircle2 className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Type a customer message…"
              className="min-h-[44px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={sending}
            />
            <Button
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              className="self-end"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <aside className="rounded-xl border border-border bg-card p-4 text-sm">
        <div className="mb-3 flex items-center gap-2 font-medium">
          <Activity className="h-4 w-4 text-primary" />
          Execution trace
        </div>
        {!lastTrace ? (
          <p className="text-xs text-muted-foreground">
            After each reply you&apos;ll see prompt, retrieval, tools,
            latency, tokens, cost, and confidence.
          </p>
        ) : (
          <div className="space-y-3 text-xs text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Latency</p>
              <p>{lastTrace.latency_ms ?? '—'} ms</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Confidence</p>
              <p>
                {lastTrace.confidence != null
                  ? `${Math.round(lastTrace.confidence * 100)}%`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Tokens</p>
              <p>
                {lastTrace.tokens
                  ? `${lastTrace.tokens.promptTokens} in / ${lastTrace.tokens.completionTokens} out`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Est. cost</p>
              <p>
                {lastTrace.estimated_cost_usd != null
                  ? `$${lastTrace.estimated_cost_usd.toFixed(6)}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Retrieval</p>
              <p>
                {lastTrace.retrieval?.length
                  ? `${lastTrace.retrieval.length} chunk(s)`
                  : 'None'}
              </p>
              {lastTrace.retrieval?.slice(0, 2).map((r, i) => (
                <p
                  key={i}
                  className="mt-1 line-clamp-3 rounded bg-muted/60 p-1.5 text-[11px]"
                >
                  {r}
                </p>
              ))}
            </div>
            <div>
              <p className="font-medium text-foreground">Tools registered</p>
              <p>
                {lastTrace.tools?.length
                  ? lastTrace.tools.join(', ')
                  : 'None yet'}
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Prompt preview</p>
              <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded bg-muted/60 p-1.5 text-[11px]">
                {lastTrace.prompt_preview ?? '—'}
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
