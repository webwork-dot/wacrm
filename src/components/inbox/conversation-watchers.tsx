"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ConversationWatchersProps {
  conversationId: string;
}

type WatcherRow = {
  user_id: string;
  profile?: { full_name?: string | null; email?: string | null } | null;
};

/**
 * Watch / unwatch this thread. Uses conversation_watchers (migration 038).
 */
export function ConversationWatchers({ conversationId }: ConversationWatchersProps) {
  const { accountId, user } = useAuth();
  const [watching, setWatching] = useState(false);
  const [watchers, setWatchers] = useState<WatcherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accountId || !user?.id) return;
    const supabase = createClient();
    setLoading(true);
    const { data } = await supabase
      .from("conversation_watchers")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("account_id", accountId);
    const rows = (data ?? []) as { user_id: string }[];
    setWatching(rows.some((r) => r.user_id === user.id));

    if (rows.length === 0) {
      setWatchers([]);
      setLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("account_id", accountId)
      .in(
        "user_id",
        rows.map((r) => r.user_id),
      );
    const byId = new Map(
      (profiles ?? []).map((p: { user_id: string; full_name?: string; email?: string }) => [
        p.user_id,
        p,
      ]),
    );
    setWatchers(
      rows.map((r) => ({
        user_id: r.user_id,
        profile: byId.get(r.user_id) ?? null,
      })),
    );
    setLoading(false);
  }, [accountId, user?.id, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(async () => {
    if (!accountId || !user?.id || busy) return;
    setBusy(true);
    const supabase = createClient();
    if (watching) {
      const { error } = await supabase
        .from("conversation_watchers")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .eq("account_id", accountId);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("conversation_watchers").insert({
        conversation_id: conversationId,
        user_id: user.id,
        account_id: accountId,
      });
      if (error) toast.error(error.message);
    }
    setBusy(false);
    void load();
  }, [accountId, user?.id, busy, watching, conversationId, load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Watchers
        </span>
        <button
          type="button"
          disabled={busy || loading || !user}
          onClick={() => void toggle()}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] transition-colors hover:bg-muted",
            watching ? "text-primary" : "text-muted-foreground",
          )}
          title={watching ? "Stop watching" : "Watch this conversation"}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : watching ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
          {watching ? "Watching" : "Watch"}
        </button>
      </div>
      {loading ? (
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">Loading…</p>
      ) : watchers.length === 0 ? (
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          No one is watching yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 px-1">
          {watchers.map((w) => (
            <li key={w.user_id} className="text-xs text-foreground">
              {w.profile?.full_name || w.profile?.email || "Agent"}
              {w.user_id === user?.id ? " (you)" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
