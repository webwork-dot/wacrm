'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Sparkles, Settings2, BarChart3, BookOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { AiKnowledgeCard } from '@/components/settings/ai-knowledge';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';

type Tab = 'sandbox' | 'studio' | 'knowledge' | 'usage';

function normalizeTab(raw: string | null, configured: boolean): Tab {
  if (raw === 'playground' || raw === 'sandbox') return 'sandbox';
  if (raw === 'setup' || raw === 'studio') return 'studio';
  if (raw === 'knowledge') return 'knowledge';
  if (raw === 'usage') return 'usage';
  return configured ? 'sandbox' : 'studio';
}

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsPageInner />
    </Suspense>
  );
}

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const { accountId, accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const [tab, setTab] = useState<Tab>('sandbox');
  const [decided, setDecided] = useState(false);
  const [hasEmbeddingsKey, setHasEmbeddingsKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/config');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setHasEmbeddingsKey(Boolean(data?.has_embeddings_key));
        setTab(
          normalizeTab(searchParams.get('tab'), Boolean(data?.configured)),
        );
      } catch {
        if (!cancelled) {
          setTab(normalizeTab(searchParams.get('tab'), false));
        }
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          AI Studio
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Wizard-built prompts, Knowledge Hub grounding, and a sandbox that
        mirrors live auto-reply — with your own LLM keys.
      </p>

      {decided && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="mt-6"
        >
          <TabsList>
            <TabsTrigger value="sandbox">
              <Sparkles className="mr-1.5 h-4 w-4" /> Sandbox
            </TabsTrigger>
            <TabsTrigger value="studio">
              <Settings2 className="mr-1.5 h-4 w-4" /> Studio
            </TabsTrigger>
            <TabsTrigger value="knowledge">
              <BookOpen className="mr-1.5 h-4 w-4" /> Knowledge Hub
            </TabsTrigger>
            {canViewUsage && (
              <TabsTrigger value="usage">
                <BarChart3 className="mr-1.5 h-4 w-4" /> Usage
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="sandbox" className="mt-4">
            <AiPlayground onGoToSetup={() => setTab('studio')} />
          </TabsContent>

          <TabsContent value="studio" className="mt-4">
            <AiConfig />
          </TabsContent>

          <TabsContent value="knowledge" className="mt-4">
            <AiKnowledgeCard
              accountId={accountId}
              canEdit={canEdit}
              hasEmbeddingsKey={hasEmbeddingsKey}
            />
          </TabsContent>

          {canViewUsage && (
            <TabsContent value="usage" className="mt-4">
              <AiUsageCard />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
