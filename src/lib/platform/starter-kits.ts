/**
 * Starter Kits — industry packs (NOT a marketplace).
 * Compose existing flow templates + knowledge seeds + AI studio profile.
 */

import { listFlowTemplates, getFlowTemplate } from "@/lib/flows/templates";
import type { AiStudioProfile } from "@/lib/ai/studio/profile";

export interface StarterKitKnowledgeDoc {
  title: string;
  content: string;
  source_type: "faq" | "manual";
}

export interface StarterKit {
  slug: string;
  name: string;
  description: string;
  industry: string;
  /** Flow template slug from lib/flows/templates */
  flow_template_slug: string | null;
  /** Optional automation template slug */
  automation_template_slug: string | null;
  studio_profile: Partial<AiStudioProfile>;
  knowledge_docs: StarterKitKnowledgeDoc[];
  tags: string[];
}

const RETAIL_SUPPORT: StarterKit = {
  slug: "retail_support",
  name: "Retail support pack",
  description:
    "Welcome menu flow, FAQ knowledge, and a friendly retail AI persona.",
  industry: "Retail",
  flow_template_slug: "welcome_menu",
  automation_template_slug: "welcome_message",
  studio_profile: {
    business_name: "Your store",
    business_description: "We sell products online and via WhatsApp.",
    products_services: "Catalog products, order status, returns.",
    tone: "friendly, clear, and sales-aware without being pushy",
    restrictions: "Do not invent discounts or stock levels.",
    languages: "Customer language",
    support_hours: "Mon–Sat 9:00–18:00",
    guardrails: "Never share internal costs or other customers' data.",
  },
  knowledge_docs: [
    {
      title: "Shipping FAQ",
      content:
        "Standard shipping takes 3–5 business days. Express is 1–2 days. Tracking is sent by SMS or WhatsApp after dispatch.",
      source_type: "faq",
    },
    {
      title: "Returns policy",
      content:
        "Unused items can be returned within 14 days with receipt. Refunds process in 5–7 business days.",
      source_type: "faq",
    },
  ],
  tags: ["retail", "faq", "welcome"],
};

const SERVICES_LEADS: StarterKit = {
  slug: "services_leads",
  name: "Services lead capture",
  description:
    "Lead capture flow plus qualifier automation and a consultative AI tone.",
  industry: "Professional services",
  flow_template_slug: "lead_capture",
  automation_template_slug: "lead_qualifier",
  studio_profile: {
    business_name: "Your agency",
    business_description: "We help businesses with professional services.",
    products_services: "Consultations, proposals, ongoing retainers.",
    tone: "professional, consultative, concise",
    restrictions: "Do not quote exact prices unless listed in knowledge.",
    languages: "Customer language",
    support_hours: "Weekdays 9:00–17:00",
    guardrails: "Escalate legal, medical, or financial advice to a human.",
  },
  knowledge_docs: [
    {
      title: "How booking works",
      content:
        "Share your name, need, and preferred time. An agent confirms within one business day.",
      source_type: "faq",
    },
  ],
  tags: ["services", "leads"],
};

const FAQ_BOT: StarterKit = {
  slug: "faq_bot_pack",
  name: "FAQ bot pack",
  description: "FAQ conversational flow with starter knowledge articles.",
  industry: "General",
  flow_template_slug: "faq_bot",
  automation_template_slug: null,
  studio_profile: {
    tone: "helpful and patient",
    restrictions: "If unsure, say you will check with the team.",
    guardrails: "Do not invent policies.",
  },
  knowledge_docs: [
    {
      title: "Common questions",
      content:
        "Q: How do I contact support?\nA: Reply here on WhatsApp anytime during support hours.\n\nQ: Where are you located?\nA: See our website contact page for address details.",
      source_type: "faq",
    },
  ],
  tags: ["faq"],
};

const KITS: StarterKit[] = [RETAIL_SUPPORT, SERVICES_LEADS, FAQ_BOT];

export function listStarterKits(): StarterKit[] {
  // Drop kits whose flow template no longer exists.
  return KITS.filter(
    (k) => !k.flow_template_slug || !!getFlowTemplate(k.flow_template_slug),
  );
}

export function getStarterKit(slug: string): StarterKit | null {
  return listStarterKits().find((k) => k.slug === slug) ?? null;
}

/** Summaries for gallery UIs (no heavy payloads). */
export function listStarterKitSummaries() {
  return listStarterKits().map((k) => ({
    slug: k.slug,
    name: k.name,
    description: k.description,
    industry: k.industry,
    tags: k.tags,
    includes: {
      flow: !!k.flow_template_slug,
      automation: !!k.automation_template_slug,
      knowledge: k.knowledge_docs.length,
      ai_profile: Object.keys(k.studio_profile).length > 0,
    },
  }));
}

export function availableFlowTemplateCount(): number {
  return listFlowTemplates().length;
}
