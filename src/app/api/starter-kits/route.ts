import { NextResponse } from "next/server";
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateSystemPromptFromProfile,
  normalizeStudioProfile,
} from "@/lib/ai/studio/profile";
import { loadEmbeddingsKey } from "@/lib/ai/config";
import { ingestDocument } from "@/lib/ai/knowledge";
import {
  getStarterKit,
  listStarterKitSummaries,
} from "@/lib/platform/starter-kits";
import { getFlowTemplate } from "@/lib/flows/templates";
import { getTemplate as getAutomationTemplate } from "@/lib/automations/templates";
import { supabaseAdmin } from "@/lib/flows/admin-client";

/** GET /api/starter-kits — list industry packs. */
export async function GET() {
  try {
    await getCurrentAccount();
    return NextResponse.json({ kits: listStarterKitSummaries() });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/starter-kits
 * Body: { slug: string }
 * Installs flow (+ optional automation draft), knowledge docs, AI studio profile.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole("admin");
    const limit = checkRateLimit(`starter-kits:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const kit = getStarterKit(slug);
    if (!kit) {
      return NextResponse.json({ error: "Unknown starter kit" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const result: {
      flow_id: string | null;
      automation_id: string | null;
      knowledge_ids: string[];
      ai_profile_applied: boolean;
    } = {
      flow_id: null,
      automation_id: null,
      knowledge_ids: [],
      ai_profile_applied: false,
    };

    // ---- Flow from template ----
    if (kit.flow_template_slug) {
      const template = getFlowTemplate(kit.flow_template_slug);
      if (template) {
        const { data: flow, error: flowErr } = await admin
          .from("flows")
          .insert({
            user_id: userId,
            account_id: accountId,
            name: `${kit.name} — ${template.name}`,
            description: kit.description,
            status: "draft",
            trigger_type: template.trigger_type,
            trigger_config: template.trigger_config,
            entry_node_id: template.entry_node_id,
          })
          .select("id")
          .single();
        if (!flowErr && flow) {
          if (template.nodes.length > 0) {
            await admin.from("flow_nodes").insert(
              template.nodes.map((n) => ({
                flow_id: flow.id,
                node_key: n.node_key,
                node_type: n.node_type,
                config: n.config,
              })),
            );
          }
          result.flow_id = flow.id;
        }
      }
    }

    // ---- Automation from template (best-effort) ----
    if (kit.automation_template_slug) {
      const autoTpl = getAutomationTemplate(kit.automation_template_slug);
      if (autoTpl) {
        const { data: auto, error: autoErr } = await admin
          .from("automations")
          .insert({
            user_id: userId,
            account_id: accountId,
            name: `${kit.name} — ${autoTpl.name}`,
            description: autoTpl.description ?? kit.description,
            is_active: false,
            trigger_type: autoTpl.trigger_type,
            trigger_config: autoTpl.trigger_config ?? {},
          })
          .select("id")
          .single();
        if (!autoErr && auto) {
          result.automation_id = auto.id;
          if (autoTpl.steps?.length) {
            await admin.from("automation_steps").insert(
              autoTpl.steps.map((s, i) => ({
                automation_id: auto.id,
                step_order: i + 1,
                step_type: s.step_type,
                step_config: s.step_config ?? {},
                branch: s.branch ?? null,
              })),
            );
          }
        }
      }
    }

    // ---- Knowledge Hub docs ----
    const { key: embeddingsApiKey } = await loadEmbeddingsKey(supabase, accountId);
    for (const doc of kit.knowledge_docs) {
      const { data: inserted, error } = await admin
        .from("ai_knowledge_documents")
        .insert({
          account_id: accountId,
          created_by: userId,
          title: doc.title,
          content: doc.content,
          source_type: doc.source_type,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
          version: 1,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        // Pre-043 schema: retry without hub columns
        const { data: legacy } = await admin
          .from("ai_knowledge_documents")
          .insert({
            account_id: accountId,
            created_by: userId,
            title: doc.title,
            content: doc.content,
          })
          .select("id")
          .single();
        if (legacy) {
          result.knowledge_ids.push(legacy.id);
          try {
            await ingestDocument(
              admin,
              accountId,
              { embeddingsApiKey },
              legacy.id,
              doc.content,
            );
          } catch {
            /* lexical still works */
          }
        }
        continue;
      }
      result.knowledge_ids.push(inserted.id);
      try {
        await ingestDocument(
          admin,
          accountId,
          { embeddingsApiKey },
          inserted.id,
          doc.content,
        );
      } catch {
        await admin
          .from("ai_knowledge_documents")
          .update({
            sync_status: "error",
            sync_error: "Indexing failed — use Reindex to retry",
          })
          .eq("id", inserted.id);
      }
    }

    // ---- AI Studio profile (merge into existing config if present) ----
    const profile = normalizeStudioProfile(kit.studio_profile);
    const systemPrompt = generateSystemPromptFromProfile(profile);
    const { data: existingAi } = await admin
      .from("ai_configs")
      .select("id, system_prompt")
      .eq("account_id", accountId)
      .maybeSingle();

    if (existingAi) {
      const { error: upErr } = await admin
        .from("ai_configs")
        .update({
          studio_profile: profile,
          system_prompt:
            (existingAi as { system_prompt: string | null }).system_prompt ||
            systemPrompt,
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId);
      result.ai_profile_applied = !upErr;
    } else {
      // No API key yet — cannot insert ai_configs (api_key NOT NULL).
      // Profile is returned so UI can stash / prompt user to finish Setup.
      result.ai_profile_applied = false;
    }

    return NextResponse.json({
      success: true,
      kit: slug,
      ...result,
      studio_profile: profile,
      system_prompt: systemPrompt,
      hint: result.ai_profile_applied
        ? undefined
        : "Add your LLM key in AI Studio to save the generated persona.",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
