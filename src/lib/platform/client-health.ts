/**
 * Client health score — computed, not a new module.
 */

export type HealthLevel = "healthy" | "warning" | "critical";

export interface HealthInputs {
  whatsappConnected: boolean;
  aiConfigured: boolean;
  knowledgeHasDocs: boolean;
  automationActive: boolean;
  status?: "active" | "suspended";
}

export interface HealthResult {
  level: HealthLevel;
  score: number;
  reasons: string[];
}

export function computeClientHealth(input: HealthInputs): HealthResult {
  if (input.status === "suspended") {
    return {
      level: "critical",
      score: 0,
      reasons: ["Workspace is suspended"],
    };
  }
  const reasons: string[] = [];
  let score = 0;
  if (input.whatsappConnected) score += 30;
  else reasons.push("WhatsApp not connected");
  if (input.aiConfigured) score += 20;
  else reasons.push("AI not set up");
  if (input.knowledgeHasDocs) score += 20;
  else reasons.push("No knowledge documents");
  if (input.automationActive) score += 30;
  else reasons.push("No active automation");

  let level: HealthLevel = "healthy";
  if (score < 40) level = "critical";
  else if (score < 70) level = "warning";
  else reasons.length = 0;

  return { level, score, reasons };
}
