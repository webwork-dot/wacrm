'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Settings2, BarChart3, BookOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { AiKnowledgeCard } from '@/components/settings/ai-knowledge';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { FeatureGate } from '@/components/ux/feature-gate';
import { PageHeader } from '@/components/ux/page-header';
import { EmptyGuide } from '@/components/ux/empty-guide';

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
  const [configured, setConfigured] = useState(false);
  const [hasEmbeddingsKey, setHasEmbeddingsKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/config');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setHasEmbeddingsKey(Boolean(data?.has_embeddings_key));
        setConfigured(Boolean(data?.configured));
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
    <FeatureGate
      featureFlag="ai_studio"
      planEntitlement="ai_studio"
      title="AI Studio is not on your plan"
      description="Upgrade or ask your workspace admin to enable AI Studio."
    >
      <div>
        <PageHeader
          title="AI Studio"
          description="Connect your AI provider, ground answers in Knowledge Hub, then test in the sandbox."
          nextStep={
            !configured
              ? 'Connect an AI provider'
              : 'Add knowledge and try the sandbox'
          }
        />

        {decided && !configured ? (
          <div className="mb-4">
            <EmptyGuide
              title="Connect AI to get started"
              description="Bring your own API keys. Convexa never sells AI credits — you control the provider."
              steps={[
                { label: 'Open Studio setup', href: '/agents?tab=studio' },
                { label: 'Add Knowledge', href: '/agents?tab=knowledge' },
                { label: 'Test in Sandbox', href: '/agents?tab=sandbox' },
              ]}
            />
          </div>
        ) : null}

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
    </FeatureGate>
  );
}
