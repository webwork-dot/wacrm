import { describe, expect, it } from "vitest";
import {
  generateSystemPromptFromProfile,
  normalizeStudioProfile,
  estimateConfidence,
} from "./profile";

describe("AI Studio prompt generator", () => {
  it("normalizes partial profiles", () => {
    const p = normalizeStudioProfile({ business_name: "Acme", tone: 1 });
    expect(p.business_name).toBe("Acme");
    expect(p.tone).toBe("friendly and professional");
  });

  it("generates a prompt from wizard fields", () => {
    const prompt = generateSystemPromptFromProfile({
      business_name: "Acme",
      products_services: "Widgets",
      tone: "warm",
      restrictions: "No refunds over 30 days",
    });
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("Widgets");
    expect(prompt).toContain("warm");
    expect(prompt).toContain("No refunds");
  });

  it("scores confidence lower on handoff", () => {
    expect(
      estimateConfidence({ handoff: true, retrievalCount: 2, replyLength: 10 }),
    ).toBeLessThan(0.5);
    expect(
      estimateConfidence({
        handoff: false,
        retrievalCount: 3,
        replyLength: 80,
      }),
    ).toBeGreaterThan(0.7);
  });
});
