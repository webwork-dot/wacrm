/**
 * AI Studio wizard profile — inputs for the prompt generator.
 * Stored on ai_configs.studio_profile; never invents a new module.
 */

export interface AiStudioProfile {
  business_name?: string;
  business_description?: string;
  products_services?: string;
  tone?: string;
  restrictions?: string;
  languages?: string;
  support_hours?: string;
  guardrails?: string;
}

export const EMPTY_STUDIO_PROFILE: AiStudioProfile = {
  business_name: "",
  business_description: "",
  products_services: "",
  tone: "friendly and professional",
  restrictions: "",
  languages: "",
  support_hours: "",
  guardrails: "",
};

export function normalizeStudioProfile(
  raw: unknown,
): AiStudioProfile {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STUDIO_PROFILE };
  const o = raw as Record<string, unknown>;
  const str = (k: keyof AiStudioProfile) =>
    typeof o[k] === "string" ? (o[k] as string) : "";
  return {
    business_name: str("business_name"),
    business_description: str("business_description"),
    products_services: str("products_services"),
    tone: str("tone") || EMPTY_STUDIO_PROFILE.tone,
    restrictions: str("restrictions"),
    languages: str("languages"),
    support_hours: str("support_hours"),
    guardrails: str("guardrails"),
  };
}

/**
 * Turn wizard answers into a system_prompt body (business context
 * block). Scaffold + handoff rules still come from buildSystemPrompt.
 */
export function generateSystemPromptFromProfile(
  profile: AiStudioProfile,
): string {
  const lines: string[] = [];
  const name = profile.business_name?.trim();
  const desc = profile.business_description?.trim();
  if (name) lines.push(`Business name: ${name}`);
  if (desc) lines.push(`About the business:\n${desc}`);
  const products = profile.products_services?.trim();
  if (products) lines.push(`Products and services:\n${products}`);
  const tone = profile.tone?.trim();
  if (tone) lines.push(`Tone of voice: ${tone}`);
  const languages = profile.languages?.trim();
  if (languages) {
    lines.push(
      `Preferred languages: ${languages}. Still reply in the customer's language when possible.`,
    );
  }
  const hours = profile.support_hours?.trim();
  if (hours) lines.push(`Support hours: ${hours}`);
  const restrictions = profile.restrictions?.trim();
  if (restrictions) lines.push(`Do not:\n${restrictions}`);
  const guardrails = profile.guardrails?.trim();
  if (guardrails) lines.push(`Guardrails and compliance:\n${guardrails}`);

  if (lines.length === 0) {
    return "You represent this business on WhatsApp. Be helpful, accurate, and concise.";
  }
  return lines.join("\n\n");
}

export function estimateTokenCostUsd(
  provider: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  // Rough public list prices for sandbox display only — not billing.
  const rates: Record<string, { in: number; out: number }> = {
    openai: { in: 0.15 / 1_000_000, out: 0.6 / 1_000_000 },
    anthropic: { in: 0.8 / 1_000_000, out: 4 / 1_000_000 },
  };
  const r = rates[provider];
  if (!r) return null;
  return promptTokens * r.in + completionTokens * r.out;
}

/** Heuristic confidence 0–1 from handoff + retrieval hit count. */
export function estimateConfidence(opts: {
  handoff: boolean;
  retrievalCount: number;
  replyLength: number;
}): number {
  if (opts.handoff) return 0.25;
  let score = 0.55;
  if (opts.retrievalCount > 0) score += Math.min(0.3, opts.retrievalCount * 0.1);
  if (opts.replyLength > 40) score += 0.05;
  return Math.min(0.95, Math.round(score * 100) / 100);
}
