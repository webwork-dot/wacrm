/**
 * Automation Compiler — designer graph → versioned immutable IR.
 *
 * Called on activate/publish. Validation must pass before IR is stored.
 * Runtime never reads `flow_nodes` for active runs once a compiled
 * version is pinned.
 */

import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  DEFAULT_FALLBACK_POLICY,
  type FlowFallbackPolicy,
} from "@/lib/flows/types";
import { validateFlowForActivation } from "@/lib/flows/validate";
import {
  AUTOMATION_COMPILER_VERSION,
  AUTOMATION_IR_SCHEMA_VERSION,
  type AutomationIR,
  type CompiledVersionRow,
} from "./ir";

export interface CompileInput {
  flowId: string;
  accountId: string;
  compiledBy?: string | null;
  /** When true, skip DB write and only return IR (tests / dry-run). */
  dryRun?: boolean;
}

export interface CompileResult {
  ok: true;
  ir: AutomationIR;
  versionId: string | null;
  version: number;
}

export interface CompileFailure {
  ok: false;
  issues: ReturnType<typeof validateFlowForActivation>;
}

export type CompileOutcome = CompileResult | CompileFailure;

type FlowCompileRow = {
  id: string;
  account_id: string;
  name: string;
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: Record<string, unknown>;
  entry_node_id: string | null;
  fallback_policy: FlowFallbackPolicy | null;
};

type NodeCompileRow = {
  node_key: string;
  node_type: string;
  config: Record<string, unknown>;
};

/** Pure compile from already-loaded designer rows (unit-testable). */
export function buildAutomationIR(
  flow: FlowCompileRow,
  nodes: NodeCompileRow[],
  compiledAt = new Date().toISOString(),
): CompileOutcome {
  const issues = validateFlowForActivation(
    {
      name: flow.name,
      trigger_type: flow.trigger_type,
      trigger_config: flow.trigger_config,
      entry_node_id: flow.entry_node_id,
    },
    nodes,
  );
  if (issues.some((i) => i.severity === "error")) {
    return { ok: false, issues };
  }
  if (!flow.entry_node_id) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          scope: "flow",
          field: "entry_node_id",
          message: "Entry node required to compile.",
        },
      ],
    };
  }

  const ir: AutomationIR = {
    schema_version: AUTOMATION_IR_SCHEMA_VERSION,
    flow_id: flow.id,
    account_id: flow.account_id,
    name: flow.name,
    entry_node_key: flow.entry_node_id,
    trigger_type: flow.trigger_type,
    trigger_config: flow.trigger_config ?? {},
    fallback_policy: flow.fallback_policy ?? DEFAULT_FALLBACK_POLICY,
    nodes: nodes.map((n) => ({
      node_key: n.node_key,
      node_type: n.node_type,
      config: n.config ?? {},
    })),
    compiled_at: compiledAt,
  };

  return { ok: true, ir, versionId: null, version: 0 };
}

/**
 * Load designer state, validate, persist a new compiled version, and
 * pin it on `flows.active_compiled_version_id`.
 */
export async function compileAndPublish(
  input: CompileInput,
): Promise<CompileOutcome> {
  const db = supabaseAdmin();

  const [{ data: flow, error: flowErr }, { data: nodes, error: nodesErr }] =
    await Promise.all([
      db
        .from("flows")
        .select(
          "id, account_id, name, trigger_type, trigger_config, entry_node_id, fallback_policy",
        )
        .eq("id", input.flowId)
        .eq("account_id", input.accountId)
        .maybeSingle(),
      db
        .from("flow_nodes")
        .select("node_key, node_type, config")
        .eq("flow_id", input.flowId),
    ]);

  if (flowErr || !flow) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          scope: "flow",
          message: flowErr?.message ?? "Flow not found.",
        },
      ],
    };
  }
  if (nodesErr) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          scope: "flow",
          message: nodesErr.message,
        },
      ],
    };
  }

  const built = buildAutomationIR(
    flow as FlowCompileRow,
    (nodes ?? []) as NodeCompileRow[],
  );
  if (!built.ok) return built;

  if (input.dryRun) {
    return { ...built, version: 0, versionId: null };
  }

  const { data: latest } = await db
    .from("flow_compiled_versions")
    .select("version")
    .eq("flow_id", input.flowId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = ((latest as { version: number } | null)?.version ?? 0) + 1;

  const { data: inserted, error: insertErr } = await db
    .from("flow_compiled_versions")
    .insert({
      flow_id: input.flowId,
      account_id: input.accountId,
      version: nextVersion,
      ir: built.ir,
      compiler_version: AUTOMATION_COMPILER_VERSION,
      compiled_by: input.compiledBy ?? null,
    })
    .select("id, version")
    .single();

  if (insertErr || !inserted) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          scope: "flow",
          message: insertErr?.message ?? "Failed to store compiled IR.",
        },
      ],
    };
  }

  const versionId = (inserted as { id: string; version: number }).id;
  const { error: pinErr } = await db
    .from("flows")
    .update({
      active_compiled_version_id: versionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.flowId)
    .eq("account_id", input.accountId);

  if (pinErr) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          scope: "flow",
          message: pinErr.message,
        },
      ],
    };
  }

  return {
    ok: true,
    ir: built.ir,
    versionId,
    version: nextVersion,
  };
}

export async function loadCompiledVersion(
  versionId: string,
): Promise<CompiledVersionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("flow_compiled_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CompiledVersionRow;
}

/**
 * Ensure an active flow has a pinned IR. Used as a backfill when
 * migrating pre-C1 active flows that never went through the compiler.
 */
export async function ensureCompiledForActiveFlow(
  flowId: string,
  accountId: string,
): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: flow } = await db
    .from("flows")
    .select("active_compiled_version_id, status")
    .eq("id", flowId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (!flow || (flow as { status: string }).status !== "active") return null;
  const pinned = (flow as { active_compiled_version_id: string | null })
    .active_compiled_version_id;
  if (pinned) return pinned;

  const result = await compileAndPublish({ flowId, accountId });
  if (!result.ok) {
    console.error(
      "[automation-compiler] backfill compile failed for",
      flowId,
      result.issues,
    );
    return null;
  }
  return result.versionId;
}
