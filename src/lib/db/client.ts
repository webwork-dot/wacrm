/**
 * Minimal PostgREST-style query helper over pg.
 * Lets existing `.from().select().eq()` call sites keep working
 * without Supabase Cloud / PostgREST.
 *
 * Typing is intentionally loose (`any`) so legacy call sites that
 * cast PostgREST rows continue to typecheck during the native cutover.
 */
import { getPool, query as rawQuery } from "@/lib/db/pool";

type Filter = { column: string; op: string; value: unknown };

export type PostgrestError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbResult<T = any> =
  | { data: T; error: null; count?: number | null }
  | { data: null; error: PostgrestError; count?: number | null };

class QueryBuilder {
  private table: string;
  private columns = "*";
  private filters: Filter[] = [];
  private orderClause = "";
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private singleMode: "none" | "single" | "maybe" = "none";
  private head = false;
  private wantCount = false;
  private mutation: null | {
    type: "insert" | "update" | "upsert" | "delete";
    payload?: unknown;
    onConflict?: string;
  } = null;
  private returning = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = "*", opts?: { count?: string; head?: boolean }) {
    this.columns = typeof columns === "string" ? columns : "*";
    this.returning = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.mutation = { type: "insert", payload };
    this.returning = true;
    return this;
  }

  upsert(
    payload: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string },
  ) {
    this.mutation = {
      type: "upsert",
      payload,
      onConflict: opts?.onConflict,
    };
    this.returning = true;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.mutation = { type: "update", payload };
    return this;
  }

  delete(opts?: { count?: string }) {
    this.mutation = { type: "delete" };
    if (opts?.count) this.wantCount = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "=", value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: "<>", value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, op: "IN", value: values });
    return this;
  }

  is(column: string, value: null) {
    this.filters.push({ column, op: "IS", value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ column, op: "ILIKE", value });
    return this;
  }

  like(column: string, value: string) {
    this.filters.push({ column, op: "LIKE", value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: ">=", value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: "<=", value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ column, op: ">", value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, op: "<", value });
    return this;
  }

  /** PostgREST `.contains` for array/jsonb columns. */
  contains(column: string, value: unknown) {
    this.filters.push({ column, op: "@>", value });
    return this;
  }

  /**
   * Limited PostgREST `.filter` support.
   * Handles `col`, `payload->>key`, and common ops.
   */
  filter(column: string, op: string, value: unknown) {
    const mapped =
      op === "eq"
        ? "="
        : op === "neq"
          ? "<>"
          : op === "gte"
            ? ">="
            : op === "lte"
              ? "<="
              : op === "gt"
                ? ">"
                : op === "lt"
                  ? "<"
                  : op === "ilike"
                    ? "ILIKE"
                    : op === "like"
                      ? "LIKE"
                      : op === "is"
                        ? "IS"
                        : op === "in"
                          ? "IN"
                          : op;
    this.filters.push({ column, op: mapped, value });
    return this;
  }

  not(column: string, op: string, value: unknown) {
    if (op === "is" && value === null) {
      this.filters.push({ column, op: "IS NOT", value: null });
      return this;
    }
    // Approximate: column <> value
    this.filters.push({ column, op: "<>", value });
    return this;
  }

  or(_expr: string) {
    return this;
  }

  match(obj: Record<string, unknown>) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const dir = opts?.ascending === false ? "DESC" : "ASC";
    const nulls =
      opts?.nullsFirst === true
        ? " NULLS FIRST"
        : opts?.nullsFirst === false
          ? " NULLS LAST"
          : "";
    const clause = `${orderIdent(column)} ${dir}${nulls}`;
    this.orderClause = this.orderClause
      ? `${this.orderClause}, ${clause}`
      : `ORDER BY ${clause}`;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  single() {
    this.singleMode = "single";
    this.limitN = 1;
    return this as unknown as PromiseLike<DbResult>;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    this.limitN = 1;
    return this as unknown as PromiseLike<DbResult>;
  }

  then(
    onfulfilled?: ((value: DbResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResult> {
    try {
      const client = getPool();
      if (this.mutation?.type === "insert") return this.execInsert(client);
      if (this.mutation?.type === "upsert") return this.execUpsert(client);
      if (this.mutation?.type === "update") return this.execUpdate(client);
      if (this.mutation?.type === "delete") return this.execDelete(client);
      return this.execSelect(client);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      return {
        data: null,
        error: { message: e.message ?? String(err), code: e.code },
        count: null,
      };
    }
  }

  private buildWhere(start = 1): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const parts: string[] = [];
    let i = start;
    for (const f of this.filters) {
      const col = filterIdent(f.column);
      if (f.op === "IS") {
        parts.push(`${col} IS NULL`);
      } else if (f.op === "IS NOT") {
        parts.push(`${col} IS NOT NULL`);
      } else if (f.op === "IN") {
        const vals = Array.isArray(f.value)
          ? (f.value as unknown[])
          : String(f.value)
              .replace(/^\(|\)$/g, "")
              .split(",")
              .map((s) => s.trim().replace(/^"|"$/g, ""));
        const ph = vals.map(() => `$${i++}`);
        parts.push(`${col} IN (${ph.join(",")})`);
        params.push(...vals);
      } else if (f.op === "ILIKE" || f.op === "LIKE") {
        parts.push(`${col} ${f.op} $${i++}`);
        params.push(f.value);
      } else if (f.op === "@>") {
        if (Array.isArray(f.value) && f.value.every((v) => typeof v === "string")) {
          parts.push(`${col} @> $${i++}::text[]`);
          params.push(f.value);
        } else {
          parts.push(`${col} @> $${i++}::jsonb`);
          params.push(JSON.stringify(f.value));
        }
      } else {
        parts.push(`${col} ${f.op} $${i++}`);
        params.push(f.value);
      }
    }
    return {
      sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
      params,
    };
  }

  private async execSelect(client: ReturnType<typeof getPool>) {
    const cols = simplifySelect(this.columns);
    const { sql: where, params } = this.buildWhere();
    let count: number | null = null;
    if (this.wantCount) {
      const countSql = `SELECT count(*)::int AS c FROM ${quoteIdent(this.table)} ${where}`;
      const countRes = await client.query(countSql, params);
      count = Number(countRes.rows[0]?.c ?? 0);
    }
    if (this.head) {
      return { data: null, error: null, count };
    }
    let sql = `SELECT ${cols} FROM ${quoteIdent(this.table)} ${where} ${this.orderClause}`;
    if (this.limitN != null) sql += ` LIMIT ${this.limitN}`;
    if (this.offsetN != null) sql += ` OFFSET ${this.offsetN}`;
    const { rows } = await client.query(sql, params);
    if (this.singleMode === "single") {
      if (!rows[0]) return { data: null, error: { message: "Row not found" }, count };
      return { data: rows[0], error: null, count };
    }
    if (this.singleMode === "maybe") {
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  }

  private async execInsert(client: ReturnType<typeof getPool>) {
    const rowsIn = Array.isArray(this.mutation!.payload)
      ? (this.mutation!.payload as Record<string, unknown>[])
      : [this.mutation!.payload as Record<string, unknown>];
    if (!rowsIn.length) return { data: [], error: null };
    const keys = Object.keys(rowsIn[0]);
    const params: unknown[] = [];
    const valueGroups: string[] = [];
    let i = 1;
    for (const row of rowsIn) {
      const ph: string[] = [];
      for (const k of keys) {
        ph.push(`$${i++}`);
        params.push(row[k]);
      }
      valueGroups.push(`(${ph.join(",")})`);
    }
    const sql = `INSERT INTO ${quoteIdent(this.table)} (${keys.map(quoteIdent).join(",")})
      VALUES ${valueGroups.join(",")} RETURNING *`;
    const { rows } = await client.query(sql, params);
    if (this.singleMode !== "none" || !Array.isArray(this.mutation!.payload)) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private async execUpsert(client: ReturnType<typeof getPool>) {
    const rowsIn = Array.isArray(this.mutation!.payload)
      ? (this.mutation!.payload as Record<string, unknown>[])
      : [this.mutation!.payload as Record<string, unknown>];
    const row = rowsIn[0];
    if (!row) return { data: null, error: null };
    const keys = Object.keys(row);
    const params: unknown[] = [];
    const ph = keys.map((_, idx) => `$${idx + 1}`);
    params.push(...keys.map((k) => row[k]));
    const conflict = this.mutation!.onConflict
      ? this.mutation!.onConflict.split(",").map((c) => quoteIdent(c.trim())).join(", ")
      : quoteIdent("id");
    const updates = keys
      .filter((k) => k !== "id")
      .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
      .join(", ");
    const sql = `INSERT INTO ${quoteIdent(this.table)} (${keys.map(quoteIdent).join(",")})
      VALUES (${ph.join(",")})
      ON CONFLICT (${conflict}) DO UPDATE SET ${updates || `${quoteIdent(keys[0])} = EXCLUDED.${quoteIdent(keys[0])}`}
      RETURNING *`;
    const { rows } = await client.query(sql, params);
    return { data: rows[0] ?? null, error: null };
  }

  private async execUpdate(client: ReturnType<typeof getPool>) {
    const row = this.mutation!.payload as Record<string, unknown>;
    const keys = Object.keys(row);
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const k of keys) {
      sets.push(`${quoteIdent(k)} = $${i++}`);
      params.push(row[k]);
    }
    const where = this.buildWhere(i);
    params.push(...where.params);
    const sql = `UPDATE ${quoteIdent(this.table)} SET ${sets.join(", ")} ${where.sql}
      ${this.returning || this.singleMode !== "none" ? "RETURNING *" : ""}`;
    const { rows } = await client.query(sql, params);
    if (this.singleMode !== "none") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private async execDelete(client: ReturnType<typeof getPool>) {
    const { sql: where, params } = this.buildWhere();
    let count: number | null = null;
    if (this.wantCount) {
      const countSql = `SELECT count(*)::int AS c FROM ${quoteIdent(this.table)} ${where}`;
      const countRes = await client.query(countSql, params);
      count = Number(countRes.rows[0]?.c ?? 0);
    }
    const sql = `DELETE FROM ${quoteIdent(this.table)} ${where} RETURNING *`;
    const { rows } = await client.query(sql, params);
    return { data: rows, error: null, count: count ?? rows.length };
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

/** Allow `payload->>meta_message_id` style filter columns. */
function filterIdent(name: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return quoteIdent(name);
  if (/^[a-zA-Z_][a-zA-Z0-9_]*->>'[a-zA-Z0-9_]+'$/.test(name)) return name;
  if (/^[a-zA-Z_][a-zA-Z0-9_]*->>'?[a-zA-Z0-9_]+'?$/.test(name)) return name;
  throw new Error(`Invalid filter identifier: ${name}`);
}

function orderIdent(name: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return quoteIdent(name);
  throw new Error(`Invalid order identifier: ${name}`);
}

function simplifySelect(columns: string): string {
  if (columns === "*" || !columns.includes("(")) {
    return columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        if (c === "*") return "*";
        // allow aliases: "name as label"
        const m = c.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?$/i);
        if (m) return m[2] ? `${quoteIdent(m[1])} AS ${quoteIdent(m[2])}` : quoteIdent(m[1]);
        return quoteIdent(c.replace(/"/g, ""));
      })
      .join(", ");
  }
  return (
    columns
      .split(",")
      .map((c) => c.trim())
      .filter((c) => !c.includes("("))
      .map((c) => quoteIdent(c.replace(/"/g, "")))
      .join(", ") || "*"
  );
}

const ALLOWED_RPC = new Set([
  "increment_flow_execution_count",
  "increment_automation_execution_count",
  "record_webhook_failure",
  "touch_presence",
  "redeem_invitation",
  "transfer_account_ownership",
  "remove_account_member",
  "match_ai_knowledge_semantic",
  "match_ai_knowledge_fts",
  "claim_ai_reply_slot",
  "peek_invitation",
]);

export type DbClient = {
  // PostgREST-compatible builder; typed loosely for cutover compatibility.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<DbResult>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeChannel?: any;
};

/** Compatibility alias used by legacy call sites during the Supabase cutover. */
export type SupabaseClient = DbClient;

async function callRpc(fn: string, args: Record<string, unknown> = {}): Promise<DbResult> {
  if (!ALLOWED_RPC.has(fn)) {
    return { data: null, error: { message: `RPC not allowed: ${fn}` } };
  }
  try {
    const keys = Object.keys(args);
    for (const k of keys) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(k)) {
        return { data: null, error: { message: `Invalid RPC argument: ${k}` } };
      }
    }
    const params = keys.map((k) => args[k]);
    const named = keys.map((k, idx) => `${k} := $${idx + 1}`).join(", ");
    const sql = `SELECT * FROM ${fn}(${named})`;
    const { rows } = await rawQuery(sql, params);

    // Scalar RPCs (single row, single column) → unwrap to the value
    // so callers like `claim_ai_reply_slot` can compare to `true`.
    if (
      rows.length === 1 &&
      rows[0] &&
      Object.keys(rows[0]).length === 1
    ) {
      const only = Object.values(rows[0])[0];
      if (
        typeof only === "boolean" ||
        typeof only === "number" ||
        typeof only === "string" ||
        only === null
      ) {
        return { data: only, error: null };
      }
    }
    // SETOF / multi-row → full array (knowledge match_*).
    return { data: rows, error: null };
  } catch (err) {
    const e = err as { message?: string; code?: string };
    return { data: null, error: { message: e.message ?? String(err), code: e.code } };
  }
}

export function createDbClient(): DbClient {
  return {
    from(_table: string) {
      return new QueryBuilder(_table);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      return callRpc(fn, args);
    },
  };
}

/** Drop-in replacement for supabaseAdmin() */
export function dbAdmin(): DbClient {
  return createDbClient();
}
