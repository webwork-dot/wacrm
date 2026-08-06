import { describe, expect, it } from "vitest";
import { buildAutomationIR } from "./compiler";
import { AUTOMATION_IR_SCHEMA_VERSION } from "./ir";
import { DEFAULT_FALLBACK_POLICY } from "@/lib/flows/types";

describe("automation compiler", () => {
  const baseFlow = {
    id: "f1",
    account_id: "a1",
    name: "Welcome",
    trigger_type: "keyword" as const,
    trigger_config: { keywords: ["hi"], match_type: "exact" as const },
    entry_node_id: "start",
    fallback_policy: DEFAULT_FALLBACK_POLICY,
  };

  const nodes = [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "msg" },
    },
    {
      node_key: "msg",
      node_type: "send_message",
      config: { text: "Hello", next_node_key: "end" },
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ];

  it("builds immutable IR from a valid designer graph", () => {
    const result = buildAutomationIR(baseFlow, nodes, "2026-01-01T00:00:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.schema_version).toBe(AUTOMATION_IR_SCHEMA_VERSION);
    expect(result.ir.entry_node_key).toBe("start");
    expect(result.ir.nodes).toHaveLength(3);
    expect(result.ir.trigger_config).toEqual(baseFlow.trigger_config);
    expect(result.ir.compiled_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("refuses to compile when validation fails", () => {
    const result = buildAutomationIR(
      { ...baseFlow, entry_node_id: null },
      nodes,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.severity === "error")).toBe(true);
  });
});
