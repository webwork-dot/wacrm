"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ConnectionPublic {
  id: string;
  type: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  has_secrets: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  latency_ms: number | null;
  provider_mode: string;
}

const STATUS_CLASS: Record<string, string> = {
  healthy: "text-emerald-600",
  degraded: "text-amber-600",
  error: "text-red-500",
  unknown: "text-muted-foreground",
  disconnected: "text-muted-foreground",
};

/**
 * Connections Manager UI — configure integrations once; other modules
 * reference connection_id. No redesign of Settings chrome.
 */
export function ConnectionsPanel() {
  const [rows, setRows] = useState<ConnectionPublic[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connections");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to load connections");
        setRows([]);
        return;
      }
      setRows((data.connections ?? []) as ConnectionPublic[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Connections</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Meta, AI providers, and other integrations once. Automation
            and AI Studio reuse these connection IDs — never paste credentials into
            flows.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {loading && !rows ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <PlugZap className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No connections yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect WhatsApp or AI under their settings tabs — they appear here
            automatically.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {c.name}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {c.type.replace(/_/g, " ")}
                  {c.has_secrets ? " · secrets stored" : ""}
                  {c.provider_mode === "client_owned" ? " · your credentials" : ""}
                </p>
                {c.last_error && (
                  <p className="mt-1 text-[11px] text-red-500">{c.last_error}</p>
                )}
              </div>
              <div className="shrink-0 text-right text-[11px]">
                <p
                  className={cn(
                    "font-medium capitalize",
                    STATUS_CLASS[c.status] ?? "text-muted-foreground",
                  )}
                >
                  {c.status}
                </p>
                {c.latency_ms != null && (
                  <p className="text-muted-foreground">{c.latency_ms}ms</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
