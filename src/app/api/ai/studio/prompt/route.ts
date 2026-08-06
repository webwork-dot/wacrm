import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  generateSystemPromptFromProfile,
  normalizeStudioProfile,
} from "@/lib/ai/studio/profile";

/**
 * POST /api/ai/studio/prompt
 * Generate system_prompt text from AI Studio wizard fields (preview / apply).
 */
export async function POST(request: Request) {
  try {
    await requireRole("admin");
    const body = await request.json().catch(() => null);
    const profile = normalizeStudioProfile(body?.studio_profile ?? body);
    const system_prompt = generateSystemPromptFromProfile(profile);
    return NextResponse.json({ system_prompt, studio_profile: profile });
  } catch (err) {
    return toErrorResponse(err);
  }
}
