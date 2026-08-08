/**
 * Browser → server DB proxy.
 * Authenticated + account-scoped. Replaces PostgREST for client .from() chains.
 */
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session-cookies";
import { dbAdmin } from "@/lib/db/client";
import { query, withUser } from "@/lib/db/pool";

const ALLOWED_TABLES = new Set([
  "profiles",
  "accounts",
  "contacts",
  "contact_tags",
  "contact_notes",
  "contact_custom_values",
  "tags",
  "custom_fields",
  "conversations",
  "messages",
  "message_reactions",
  "message_templates",
  "whatsapp_config",
  "quick_replies",
  "pipelines",
  "pipeline_stages",
  "deals",
  "broadcasts",
  "broadcast_recipients",
  "automations",
  "automation_steps",
  "automation_logs",
  "flows",
  "flow_nodes",
  "flow_runs",
  "flow_run_events",
  "notifications",
  "ai_configs",
  "ai_knowledge_documents",
  "ai_knowledge_chunks",
  "connections",
  "member_presence",
  "inbox_settings",
  "conversation_watchers",
  "conversation_notes",
  "conversation_events",
  "api_keys",
  "webhook_endpoints",
  "account_invitations",
  "feature_flags",
  "files",
]);

/** Tables that must always be filtered by account_id. */
const ACCOUNT_ID_TABLES = new Set([
  "contacts",
  "tags",
  "contact_notes",
  "custom_fields",
  "conversations",
  "message_templates",
  "whatsapp_config",
  "quick_replies",
  "pipelines",
  "deals",
  "broadcasts",
  "automations",
  "automation_logs",
  "flows",
  "flow_runs",
  "notifications",
  "ai_configs",
  "ai_knowledge_documents",
  "ai_knowledge_chunks",
  "connections",
  "member_presence",
  "inbox_settings",
  "conversation_watchers",
  "conversation_notes",
  "conversation_events",
  "api_keys",
  "webhook_endpoints",
  "account_invitations",
  "files",
  "feature_flags",
]);

const PROFILE_LOCKED_COLS = new Set([
  "account_id",
  "account_role",
  "user_id",
  "id",
]);

type Filter = { column: string; op: string; value: unknown };
type Body = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  filters?: Filter[];
  payload?: Record<string, unknown> | Record<string, unknown>[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  single?: "single" | "maybe" | null;
};

function safeIdent(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/i.test(name);
}

async function resolveAccountId(userId: string): Promise<string | null> {
  const { rows } = await query<{ account_id: string | null }>(
    `SELECT account_id FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.account_id ?? null;
}

function stripLockedProfileFields(
  payload: Record<string, unknown> | Record<string, unknown>[] | undefined,
) {
  if (!payload) return payload;
  const strip = (row: Record<string, unknown>) => {
    const next = { ...row };
    for (const k of PROFILE_LOCKED_COLS) delete next[k];
    return next;
  };
  return Array.isArray(payload) ? payload.map(strip) : strip(payload);
}

function forceAccountId(
  payload: Record<string, unknown> | Record<string, unknown>[] | undefined,
  accountId: string,
) {
  if (!payload) return payload;
  const force = (row: Record<string, unknown>) => ({
    ...row,
    account_id: accountId,
  });
  return Array.isArray(payload) ? payload.map(force) : force(payload);
}

function hasEqFilter(filters: Filter[] | undefined, column: string): boolean {
  return (filters ?? []).some((f) => f.column === column && f.op === "=");
}

export async function POST(req: Request) {
  const user = await getRequestUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.table || !ALLOWED_TABLES.has(body.table)) {
    return NextResponse.json({ error: "Table not allowed" }, { status: 403 });
  }

  const accountId = await resolveAccountId(user.id);

  // Mutations/selects that are account-scoped require membership.
  if (body.table !== "profiles" && body.table !== "accounts" && !accountId) {
    return NextResponse.json(
      { error: "Profile is not linked to an account" },
      { status: 403 },
    );
  }

  try {
    let filters = [...(body.filters ?? [])];
    let payload = body.payload;

    if (ACCOUNT_ID_TABLES.has(body.table) && accountId) {
      filters = filters.filter((f) => f.column !== "account_id");
      filters.push({ column: "account_id", op: "=", value: accountId });
      if (
        body.action === "insert" ||
        body.action === "upsert" ||
        body.action === "update"
      ) {
        payload = forceAccountId(payload, accountId) as typeof payload;
      }
    }

    if (body.table === "accounts" && accountId) {
      filters = filters.filter((f) => f.column !== "id");
      filters.push({ column: "id", op: "=", value: accountId });
      if (body.action !== "select") {
        return NextResponse.json(
          { error: "Account mutations require admin APIs" },
          { status: 403 },
        );
      }
    }

    if (body.table === "profiles") {
      if (body.action === "insert" || body.action === "delete") {
        return NextResponse.json(
          { error: "Profile create/delete not allowed via proxy" },
          { status: 403 },
        );
      }
      if (body.action === "update" || body.action === "upsert") {
        filters = filters.filter((f) => f.column !== "user_id");
        filters.push({ column: "user_id", op: "=", value: user.id });
        payload = stripLockedProfileFields(payload) as typeof payload;
      } else if (accountId) {
        // Teammate directory: same account only
        filters = filters.filter((f) => f.column !== "account_id");
        filters.push({ column: "account_id", op: "=", value: accountId });
      } else {
        filters = filters.filter((f) => f.column !== "user_id");
        filters.push({ column: "user_id", op: "=", value: user.id });
      }
    }

    // Child tables without account_id — scope via parent conversations.
    if (
      (body.table === "messages" || body.table === "message_reactions") &&
      accountId
    ) {
      const convId = filters.find(
        (f) => f.column === "conversation_id" && f.op === "=",
      )?.value;
      if (convId) {
        const { rows } = await query<{ id: string }>(
          `SELECT id FROM conversations WHERE id = $1 AND account_id = $2`,
          [convId, accountId],
        );
        if (!rows[0]) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      } else if (body.action === "select") {
        // Account-scoped poll / list: restrict to this tenant's threads.
        const { rows: convIds } = await query<{ id: string }>(
          `SELECT id FROM conversations WHERE account_id = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 200`,
          [accountId],
        );
        const ids = convIds.map((r) => r.id);
        if (!ids.length) {
          return NextResponse.json({ data: [], error: null, count: 0 });
        }
        filters.push({ column: "conversation_id", op: "IN", value: ids });
      } else if (!hasEqFilter(filters, "id")) {
        return NextResponse.json(
          { error: "conversation_id (or id) filter required" },
          { status: 400 },
        );
      }
    }

    if (
      ["contact_tags", "contact_custom_values"].includes(body.table) &&
      accountId
    ) {
      const contactId = filters.find(
        (f) => f.column === "contact_id" && f.op === "=",
      )?.value;
      if (contactId) {
        const { rows } = await query<{ id: string }>(
          `SELECT id FROM contacts WHERE id = $1 AND account_id = $2`,
          [contactId, accountId],
        );
        if (!rows[0]) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      } else if (body.action !== "select") {
        return NextResponse.json(
          { error: "contact_id filter required" },
          { status: 400 },
        );
      }
    }

    if (
      body.action === "update" ||
      body.action === "delete"
    ) {
      const hasIdentity = filters.some(
        (f) =>
          (f.op === "=" || f.op === "IN") &&
          ["id", "user_id", "account_id", "conversation_id", "contact_id", "flow_id", "automation_id", "pipeline_id", "broadcast_id"].includes(
            f.column,
          ),
      );
      if (!hasIdentity) {
        return NextResponse.json(
          { error: "Refusing unscoped mutation" },
          { status: 400 },
        );
      }
    }

    // Cap unbounded selects
    const limit =
      body.limit != null
        ? Math.min(body.limit, 500)
        : body.action === "select"
          ? 200
          : undefined;

    const db = dbAdmin();
    let q = db.from(body.table);

    if (body.action === "select") {
      q = q.select(body.columns ?? "*");
    } else if (body.action === "insert") {
      q = q.insert(payload as Record<string, unknown>);
    } else if (body.action === "update") {
      q = q.update(payload as Record<string, unknown>);
    } else if (body.action === "delete") {
      q = q.delete();
    } else if (body.action === "upsert") {
      q = q.upsert(payload as Record<string, unknown>);
    }

    for (const f of filters) {
      if (!safeIdent(f.column) && !/^[a-zA-Z_][a-zA-Z0-9_]*->>/.test(f.column)) {
        return NextResponse.json({ error: "Invalid filter column" }, { status: 400 });
      }
      if (f.op === "=") q = q.eq(f.column, f.value);
      else if (f.op === "<>") q = q.neq(f.column, f.value);
      else if (f.op === "IN") q = q.in(f.column, f.value as unknown[]);
      else if (f.op === "IS") q = q.is(f.column, null);
      else if (f.op === "IS NOT") q = q.not(f.column, "is", null);
      else if (f.op === "ILIKE") q = q.ilike(f.column, String(f.value));
      else if (f.op === ">=") q = q.gte(f.column, f.value);
      else if (f.op === "<=") q = q.lte(f.column, f.value);
      else if (f.op === ">") q = q.gt(f.column, f.value);
      else if (f.op === "<") q = q.lt(f.column, f.value);
      else if (f.op === "@>") q = q.contains(f.column, f.value);
    }

    if (body.order) {
      if (!safeIdent(body.order.column)) {
        return NextResponse.json({ error: "Invalid order column" }, { status: 400 });
      }
      q = q.order(body.order.column, { ascending: body.order.ascending });
    }
    if (limit != null) q = q.limit(limit);
    if (body.offset != null) {
      q = q.range(body.offset, body.offset + (limit ?? 50) - 1);
    }

    let result;
    if (body.single === "single") result = await q.single();
    else if (body.single === "maybe") result = await q.maybeSingle();
    else result = await q;

    return NextResponse.json(result);
  } catch (err) {
    console.error("[db/proxy]", err);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: err instanceof Error ? err.message : "Query failed",
        },
      },
      { status: 500 },
    );
  }
}

const ALLOWED_PROXY_RPC = new Set([
  "touch_presence",
  "create_inbox_notification",
  "filter_contacts_by_tags",
]);

export async function PUT(req: Request) {
  const user = await getRequestUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { fn: string; args?: Record<string, unknown> };
  if (!body.fn || !ALLOWED_PROXY_RPC.has(body.fn)) {
    return NextResponse.json({ error: "RPC not allowed" }, { status: 403 });
  }
  try {
    const args = body.args ?? {};
    const keys = Object.keys(args);
    for (const k of keys) {
      if (!safeIdent(k)) {
        return NextResponse.json({ error: "Invalid RPC argument name" }, { status: 400 });
      }
    }
    const params = keys.map((k) => args[k]);
    const named = keys.map((k, i) => `${k} := $${i + 1}`).join(", ");
    const rows = await withUser(user.id, async (client) => {
      const res = await client.query(
        `SELECT * FROM ${body.fn}(${named})`,
        params,
      );
      return res.rows;
    });
    return NextResponse.json({
      data: rows.length <= 1 ? (rows[0] ?? null) : rows,
      error: null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: err instanceof Error ? err.message : "RPC failed",
        },
      },
      { status: 500 },
    );
  }
}
