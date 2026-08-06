/**
 * Variables Engine — namespaced interpolation for Automation + AI.
 */

export interface VariableContext {
  customer?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
  company?: Record<string, unknown>;
  agent?: Record<string, unknown>;
  knowledge?: Record<string, unknown>;
  automation?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  global?: Record<string, unknown>;
  system?: Record<string, unknown>;
  /** Legacy flat vars (flow_runs.vars). */
  vars?: Record<string, unknown>;
}

function getPath(root: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Resolve `{{customer.name}}`, `{{vars.foo}}`, `{{system.now}}`, etc.
 */
export function resolveVariable(
  expression: string,
  ctx: VariableContext,
): unknown {
  const key = expression.trim();
  if (!key) return undefined;

  // Bare key → legacy vars
  if (!key.includes(".")) {
    return ctx.vars?.[key] ?? ctx.global?.[key];
  }

  const [ns, ...rest] = key.split(".");
  const path = rest.join(".");
  const namespaces: Record<string, Record<string, unknown> | undefined> = {
    customer: ctx.customer,
    conversation: ctx.conversation,
    company: ctx.company,
    agent: ctx.agent,
    knowledge: ctx.knowledge,
    automation: ctx.automation,
    ai: ctx.ai,
    global: ctx.global,
    system: ctx.system,
    vars: ctx.vars,
  };
  const root = namespaces[ns];
  if (!root) return undefined;
  return path ? getPath(root, path) : root;
}

/** Replace `{{...}}` tokens in a template string. */
export function interpolate(
  template: string,
  ctx: VariableContext,
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    const value = resolveVariable(expr, ctx);
    if (value == null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

export function buildSystemVars(
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    now: new Date().toISOString(),
    ...extras,
  };
}
