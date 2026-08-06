/**
 * Automation Intermediate Representation (IR).
 *
 * Active automations execute this snapshot only — never live designer
 * rows from `flow_nodes`. Produced by the Compiler on publish/activate.
 */

import type { FlowFallbackPolicy } from "@/lib/flows/types";

export const AUTOMATION_IR_SCHEMA_VERSION = 1;
export const AUTOMATION_COMPILER_VERSION = "1";

export interface AutomationIRNode {
  node_key: string;
  node_type: string;
  config: Record<string, unknown>;
}

export interface AutomationIR {
  schema_version: number;
  flow_id: string;
  account_id: string;
  name: string;
  entry_node_key: string;
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: Record<string, unknown>;
  fallback_policy: FlowFallbackPolicy;
  nodes: AutomationIRNode[];
  compiled_at: string;
}

export interface CompiledVersionRow {
  id: string;
  flow_id: string;
  account_id: string;
  version: number;
  ir: AutomationIR;
  compiler_version: string;
  compiled_by: string | null;
  created_at: string;
}
