/**
 * Browser createClient — PostgREST-compatible shim over /api/db/proxy.
 * No @supabase packages. Realtime → polling. Storage → /api/files.
 */
"use client";

type Filter = { column: string; op: string; value: unknown };

type DbResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  count?: number | null;
};

class BrowserQuery {
  private table: string;
  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private payload?: Record<string, unknown> | Record<string, unknown>[];
  private orderSpec?: { column: string; ascending?: boolean };
  private limitN?: number;
  private rangeFrom?: number;
  private rangeTo?: number;
  private singleMode: "single" | "maybe" | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", _opts?: { count?: string; head?: boolean }) {
    this.columns = typeof columns === "string" ? columns : "*";
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(
    payload: Record<string, unknown> | Record<string, unknown>[],
    _opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  delete(_opts?: { count?: string }) {
    this.action = "delete";
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
  contains(column: string, value: unknown) {
    this.filters.push({ column, op: "@>", value });
    return this;
  }
  filter(column: string, op: string, value: unknown) {
    this.filters.push({ column, op, value });
    return this;
  }
  not(column: string, op: string, value: unknown) {
    if (op === "is" && value === null) {
      this.filters.push({ column, op: "IS NOT", value: null });
    } else {
      this.filters.push({ column, op: "<>", value });
    }
    return this;
  }
  or(_expr: string) {
    return this;
  }
  match(obj: Record<string, unknown>) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { column, ascending: opts?.ascending };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    this.limitN = to - from + 1;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this as unknown as PromiseLike<DbResult>;
  }
  maybeSingle() {
    this.singleMode = "maybe";
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
      const res = await fetch("/api/db/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          columns: this.columns,
          filters: this.filters,
          payload: this.payload,
          order: this.orderSpec,
          limit: this.limitN,
          offset: this.rangeFrom,
          single: this.singleMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return {
          data: null,
          error: { message: json.error || "Request failed" },
        };
      }
      return json as DbResult;
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : "Network error" },
      };
    }
  }
}

type ChannelHandler = (payload: {
  eventType: string;
  new: unknown;
  old: unknown;
}) => void;

function createPollingChannel(name: string) {
  const handlers: { table: string; cb: ChannelHandler }[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let statusCb: ((s: string) => void) | null = null;
  const lastSeen: Record<string, string> = {};
  let presence: Record<string, unknown[]> = {};

  const api = {
    on(
      _type: string,
      filter: { event?: string; schema?: string; table?: string; filter?: string },
      cb: ChannelHandler | (() => void),
    ) {
      if (filter?.table) {
        handlers.push({ table: filter.table, cb: cb as ChannelHandler });
      }
      return api;
    },
    track(payload: Record<string, unknown>) {
      const key = String(payload.userId || "self");
      presence[key] = [payload];
      return Promise.resolve("ok");
    },
    untrack() {
      presence = {};
      return Promise.resolve("ok");
    },
    presenceState() {
      return presence;
    },
    subscribe(cb?: (status: string) => void) {
      statusCb = cb ?? null;
      statusCb?.("SUBSCRIBED");
      timer = setInterval(async () => {
        for (const h of handlers) {
          try {
            const orderCol =
              h.table === "messages" ? "created_at" : "updated_at";
            const res = await fetch("/api/db/proxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                table: h.table,
                action: "select",
                columns: "*",
                order: { column: orderCol, ascending: false },
                limit: 25,
                filters: [],
              }),
            });
            if (!res.ok) {
              console.warn("[realtime-poll]", h.table, res.status);
              continue;
            }
            const json = await res.json();
            const rows = (json.data ?? []) as Array<{
              id?: string;
              updated_at?: string;
              created_at?: string;
              status?: string;
            }>;
            for (const row of rows) {
              const key = `${h.table}:${row.id}`;
              const stamp =
                `${row.updated_at || ""}|${row.created_at || ""}|${row.status || ""}`;
              if (stamp && lastSeen[key] !== stamp) {
                const isNew = !lastSeen[key];
                lastSeen[key] = stamp;
                if (!isNew || Object.keys(lastSeen).length > handlers.length) {
                  h.cb({
                    eventType: isNew ? "INSERT" : "UPDATE",
                    new: row,
                    old: {},
                  });
                }
              }
            }
          } catch (err) {
            console.warn("[realtime-poll]", h.table, err);
          }
        }
      }, 3000);
      return api;
    },
    unsubscribe() {
      if (timer) clearInterval(timer);
      timer = null;
      statusCb?.("CLOSED");
      return Promise.resolve({ error: null });
    },
  };
  void name;
  return api;
}

let browserClient: ReturnType<typeof buildClient> | undefined;

function buildClient() {
  return {
    from(table: string) {
      return new BrowserQuery(table);
    },
    channel(name: string, _opts?: unknown) {
      return createPollingChannel(name);
    },
    removeChannel(ch: { unsubscribe?: () => unknown }) {
      try {
        void ch.unsubscribe?.();
      } catch {
        /* ignore */
      }
      return Promise.resolve();
    },
    auth: {
      async getUser() {
        const res = await fetch("/api/session/context");
        if (!res.ok) return { data: { user: null }, error: { message: "Unauthorized" } };
        const ctx = await res.json();
        if (!ctx.user?.id) return { data: { user: null }, error: null };
        return {
          data: {
            user: {
              id: ctx.user.id,
              email: ctx.user.email,
              user_metadata: { full_name: ctx.user.fullName },
            },
          },
          error: null,
        };
      },
      async getSession() {
        const u = await this.getUser();
        return {
          data: { session: u.data.user ? { user: u.data.user } : null },
          error: null,
        };
      },
      async signOut(opts?: { scope?: string }): Promise<{ error: { message: string } | null }> {
        const res = await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: opts?.scope }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          return { error: { message: json.error || "Logout failed" } };
        }
        return { error: null };
      },
      async signInWithPassword() {
        return {
          data: { user: null, session: null },
          error: { message: "Use /api/auth/login" },
        };
      },
      async signUp() {
        return {
          data: { user: null, session: null },
          error: { message: "Accounts are provisioned by platform admin" },
        };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: { message: "Use /api/auth/forgot-password" } };
      },
      async updateUser(attrs?: {
        password?: string;
        email?: string;
        currentPassword?: string;
        data?: Record<string, unknown>;
      }) {
        if (attrs?.password) {
          return {
            data: { user: null },
            error: { message: "Use /api/auth/change-password" },
          };
        }
        if (attrs?.email) {
          const res = await fetch("/api/auth/update-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: attrs.email,
              currentPassword: attrs.currentPassword,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              data: { user: null },
              error: { message: json.error || "Email update failed" },
            };
          }
          return { data: { user: json.user ?? null }, error: null };
        }
        return { data: { user: null }, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(
            path: string,
            file: File | Blob,
            _opts?: { cacheControl?: string; upsert?: boolean; contentType?: string },
          ) {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("bucket", bucket);
            fd.append("path", path);
            const res = await fetch("/api/files/upload", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok) return { data: null, error: { message: json.error || "Upload failed" } };
            return { data: { path: json.path }, error: null };
          },
          getPublicUrl(path: string) {
            const bucketPath = path.includes("/") ? `${bucket}/${path}` : `${bucket}/${path}`;
            return {
              data: {
                publicUrl: `/api/files/raw?path=${encodeURIComponent(
                  path.startsWith(bucket) ? path : `${bucket}/${path}`,
                )}`,
              },
            };
          },
          async remove(_paths: string[]) {
            return { data: [], error: null };
          },
        };
      },
    },
    async rpc(fn: string, args?: Record<string, unknown>) {
      const res = await fetch("/api/db/proxy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fn, args }),
      });
      return res.json();
    },
  };
}

export function createClient() {
  if (!browserClient) browserClient = buildClient();
  return browserClient;
}

export type SupabaseClient = ReturnType<typeof createClient>;
