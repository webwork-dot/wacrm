/**
 * Executable graph loader — IR first, designer JSON never for pinned runs.
 */

import type { FlowNodeRow, FlowRow } from "@/lib/flows/types";
import {
  ensureCompiledForActiveFlow,
  loadCompiledVersion,
} from "./compiler";
import type { AutomationIR } from "./ir";

export interface ExecutableGraph {
  source: "ir" | "legacy_nodes";
  compiledVersionId: string | null;
  ir: AutomationIR | null;
  /** Flow envelope used by the runner (trigger / entry / fallback). */
  flow: FlowRow;
  nodes: Map<string, FlowNodeRow>;
}

function irToNodeMap(ir: AutomationIR, flowId: string): Map<string, FlowNodeRow> {
  const map = new Map<string, FlowNodeRow>();
  for (const n of ir.nodes) {
    map.set(n.node_key, {
      id: `ir:${n.node_key}`,
      flow_id: flowId,
      node_key: n.node_key,
      node_type: n.node_type as FlowNodeRow["node_type"],
      config: n.config,
      position_x: 0,
      position_y: 0,
      created_at: ir.compiled_at,
    });
  }
  return map;
}

function applyIrEnvelope(flow: FlowRow, ir: AutomationIR): FlowRow {
  return {
    ...flow,
    name: ir.name,
    trigger_type: ir.trigger_type,
    trigger_config: ir.trigger_config as FlowRow["trigger_config"],
    entry_node_id: ir.entry_node_key,
    fallback_policy: ir.fallback_policy,
    active_compiled_version_id: flow.active_compiled_version_id,
  };
}

/**
 * Resolve the graph a run must execute.
 *
 * Priority:
 *   1. Explicit `compiledVersionId` (pinned on the run)
 *   2. Flow's `active_compiled_version_id` (with opportunistic backfill)
 *   3. Legacy live `flow_nodes` — only when no IR exists yet (pre-C1)
 */
export async function loadExecutableGraph(
  flow: FlowRow,
  compiledVersionId?: string | null,
  loadLegacyNodes?: (flowId: string) => Promise<Map<string, FlowNodeRow>>,
): Promise<ExecutableGraph> {
  let versionId =
    compiledVersionId ?? flow.active_compiled_version_id ?? null;

  if (!versionId && flow.status === "active") {
    versionId = await ensureCompiledForActiveFlow(flow.id, flow.account_id);
  }

  if (versionId) {
    const compiled = await loadCompiledVersion(versionId);
    if (compiled?.ir) {
      const ir = compiled.ir;
      return {
        source: "ir",
        compiledVersionId: versionId,
        ir,
        flow: applyIrEnvelope(flow, ir),
        nodes: irToNodeMap(ir, flow.id),
      };
    }
    console.error(
      "[automation-runtime] compiled version missing IR:",
      versionId,
    );
  }

  // Legacy fallback — should be rare after backfill.
  const nodes = loadLegacyNodes
    ? await loadLegacyNodes(flow.id)
    : new Map<string, FlowNodeRow>();

  return {
    source: "legacy_nodes",
    compiledVersionId: null,
    ir: null,
    flow,
    nodes,
  };
}
