/**
 * Tool Registry — shared by AI Studio and Automation Runtime.
 * Register tools; never hardcode call sites to integrations.
 */

export interface ToolContext {
  accountId: string;
  connectionId?: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  /** Variables Engine snapshot for this run. */
  vars?: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  /** Connection type this tool prefers (optional). */
  connectionType?: string;
  execute: (
    ctx: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

const registry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.id, tool);
}

export function getTool(id: string): ToolDefinition | undefined {
  return registry.get(id);
}

export function listTools(): ToolDefinition[] {
  return [...registry.values()];
}

export async function runTool(
  id: string,
  ctx: ToolContext,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const tool = registry.get(id);
  if (!tool) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return tool.execute(ctx, args);
}

/** Built-in stubs — real implementations fill in via Connections. */
function registerBuiltins(): void {
  if (registry.has("crm.lookup")) return;

  registerTool({
    id: "crm.lookup",
    name: "CRM Lookup",
    description: "Look up a contact or deal in Convexa CRM",
    async execute(ctx, args) {
      return {
        ok: true,
        tool: "crm.lookup",
        accountId: ctx.accountId,
        query: args,
        note: "Use contacts/deals APIs — wired in later waves",
      };
    },
  });

  registerTool({
    id: "rest.request",
    name: "REST API",
    description: "Call an external REST endpoint via a REST connection",
    connectionType: "rest",
    async execute(ctx, args) {
      return {
        ok: true,
        tool: "rest.request",
        connectionId: ctx.connectionId ?? args.connection_id ?? null,
        note: "HTTP via Connections Manager — wired in Automation Runtime",
      };
    },
  });

  registerTool({
    id: "webhook.send",
    name: "Webhook",
    description: "POST a payload to a webhook URL connection",
    connectionType: "rest",
    async execute(ctx, args) {
      return {
        ok: true,
        tool: "webhook.send",
        connectionId: ctx.connectionId ?? null,
        args,
      };
    },
  });

  registerTool({
    id: "email.send",
    name: "Email",
    description: "Send email via SMTP connection",
    connectionType: "smtp",
    async execute(ctx) {
      return { ok: true, tool: "email.send", accountId: ctx.accountId };
    },
  });

  registerTool({
    id: "erp.lookup",
    name: "ERP Lookup",
    description: "Query ERP via configured connection",
    connectionType: "erp",
    async execute(ctx) {
      return { ok: true, tool: "erp.lookup", accountId: ctx.accountId };
    },
  });

  registerTool({
    id: "sql.query",
    name: "SQL",
    description: "Run a scoped read query (account-isolated)",
    async execute(ctx) {
      return {
        ok: false,
        tool: "sql.query",
        error: "SQL tool disabled until safety policies land",
        accountId: ctx.accountId,
      };
    },
  });

  registerTool({
    id: "payments.lookup",
    name: "Payments",
    description: "Payment lookup (stub until payments schema)",
    connectionType: "payments",
    async execute() {
      return { ok: false, tool: "payments.lookup", error: "Not configured" };
    },
  });
}

registerBuiltins();
