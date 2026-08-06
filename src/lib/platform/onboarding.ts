/**
 * Onboarding checklist — guided "what next?" for DIY setup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export interface OnboardingStatus {
  completed: boolean;
  completed_at: string | null;
  steps: OnboardingStep[];
  progress: number;
}

export async function getOnboardingStatus(
  db: SupabaseClient,
  accountId: string,
): Promise<OnboardingStatus> {
  const [
    accountRes,
    waRes,
    aiRes,
    kbRes,
    flowRes,
    connRes,
  ] = await Promise.all([
    db
      .from("accounts")
      .select("onboarding_completed_at")
      .eq("id", accountId)
      .maybeSingle(),
    db
      .from("whatsapp_config")
      .select("id")
      .eq("account_id", accountId)
      .maybeSingle(),
    db
      .from("ai_configs")
      .select("id, is_active, system_prompt, studio_profile")
      .eq("account_id", accountId)
      .maybeSingle(),
    db
      .from("ai_knowledge_documents")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId),
    db
      .from("flows")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId),
    db
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId),
  ]);

  const completedAt =
    (accountRes.data as { onboarding_completed_at: string | null } | null)
      ?.onboarding_completed_at ?? null;

  const hasWa = !!waRes.data;
  const hasAi = !!aiRes.data;
  const hasPrompt = !!(
    aiRes.data as { system_prompt?: string | null } | null
  )?.system_prompt;
  const kbCount = kbRes.count ?? 0;
  const flowCount = flowRes.count ?? 0;
  // connections table may be missing pre-041 — treat error as 0
  const connCount = connRes.error ? 0 : (connRes.count ?? 0);

  const steps: OnboardingStep[] = [
    {
      id: "whatsapp",
      title: "Connect WhatsApp",
      description: "Add your Meta Cloud API credentials (BYO).",
      href: "/settings?tab=whatsapp",
      done: hasWa || connCount > 0,
    },
    {
      id: "ai_studio",
      title: "Set up AI Studio",
      description: "Add your LLM key and generate a system prompt.",
      href: "/agents?tab=studio",
      done: hasAi && hasPrompt,
    },
    {
      id: "knowledge",
      title: "Add Knowledge Hub docs",
      description: "Paste FAQs or policies so answers stay grounded.",
      href: "/agents?tab=knowledge",
      done: kbCount > 0,
    },
    {
      id: "automation",
      title: "Install a Starter Kit or flow",
      description: "Clone a pack or build your first automation.",
      href: "/starter-kits",
      done: flowCount > 0,
    },
    {
      id: "sandbox",
      title: "Test in Sandbox",
      description: "Try a customer message before going live.",
      href: "/agents?tab=sandbox",
      done: hasAi,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return {
    completed: !!completedAt || progress === 100,
    completed_at: completedAt,
    steps,
    progress,
  };
}
