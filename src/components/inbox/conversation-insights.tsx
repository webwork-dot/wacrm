"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Conversation, Message } from "@/types";
import {
  formatSlaCountdown,
  getSlaSnapshot,
} from "@/lib/inbox/sla";
import { getCustomerServiceWindow } from "@/lib/inbox/format-time";
import { Loader2 } from "lucide-react";

interface ConversationInsightsProps {
  conversation: Conversation;
}

function ageLabel(iso: string | undefined | null): string {
  if (!iso) return "—";
  const days = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(iso)) / 86_400_000),
  );
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function avgResponseLabel(messages: Message[]): string {
  const samples: number[] = [];
  let pending: number | null = null;
  const sorted = [...messages].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  for (const m of sorted) {
    const t = Date.parse(m.created_at);
    if (m.sender_type === "customer") {
      if (pending == null) pending = t;
    } else if (pending != null && (m.sender_type === "agent" || m.sender_type === "bot")) {
      samples.push((t - pending) / 60_000);
      pending = null;
    }
  }
  if (samples.length === 0) return "—";
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (avg < 1) return "<1m";
  if (avg < 60) return `${Math.round(avg)}m`;
  return `${(avg / 60).toFixed(1)}h`;
}

/**
 * Thread-level insights card for the contact sidebar.
 * Fits Convexa Inbox UX — no new platform module.
 */
export function ConversationInsights({ conversation }: ConversationInsightsProps) {
  const { accountId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(0);
  const [received, setReceived] = useState(0);
  const [media, setMedia] = useState(0);
  const [avgResponse, setAvgResponse] = useState("—");
  const [agentName, setAgentName] = useState<string | null>(null);
  const [lastRepliedName, setLastRepliedName] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const { data: messages } = await supabase
      .from("messages")
      .select("sender_type, content_type, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(500);

    const rows = (messages ?? []) as Message[];
    let s = 0;
    let r = 0;
    let m = 0;
    for (const msg of rows) {
      if (msg.sender_type === "customer") r += 1;
      else if (msg.sender_type === "agent" || msg.sender_type === "bot") s += 1;
      if (
        msg.content_type === "image" ||
        msg.content_type === "video" ||
        msg.content_type === "document" ||
        msg.content_type === "audio"
      ) {
        m += 1;
      }
    }
    setSent(s);
    setReceived(r);
    setMedia(m);
    setAvgResponse(avgResponseLabel(rows));

    const ids = [
      conversation.assigned_agent_id,
      conversation.last_replied_by,
    ].filter(Boolean) as string[];
    if (ids.length > 0 && accountId) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("account_id", accountId)
        .in("user_id", ids);
      const map = new Map(
        (profiles ?? []).map((p: { user_id: string; full_name?: string; email?: string }) => [
          p.user_id,
          p.full_name || p.email || "Agent",
        ]),
      );
      setAgentName(
        conversation.assigned_agent_id
          ? map.get(conversation.assigned_agent_id) ?? null
          : null,
      );
      setLastRepliedName(
        conversation.last_replied_by
          ? map.get(conversation.last_replied_by) ?? null
          : null,
      );
    } else {
      setAgentName(null);
      setLastRepliedName(null);
    }
    setLoading(false);
  }, [conversation, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const session = getCustomerServiceWindow(
    conversation.last_customer_message_at ?? conversation.last_message_at,
    new Date(tick),
  );
  const sla = getSlaSnapshot(conversation, new Date(tick));
  const slaDue =
    sla.firstDueAt ?? sla.nextDueAt ?? sla.resolutionDueAt;
  const slaText = formatSlaCountdown(slaDue, new Date(tick));

  return (
    <div>
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Insights
      </div>
      {loading ? (
        <div className="mt-3 flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 px-1 text-xs">
          <Row label="Sent" value={String(sent)} />
          <Row label="Received" value={String(received)} />
          <Row label="Avg response" value={avgResponse} />
          <Row label="Media" value={String(media)} />
          <Row
            label="Session"
            value={session.expired ? "Expired" : session.remainingLabel}
            valueClassName={session.expired ? "text-red-500" : undefined}
          />
          <Row
            label="SLA"
            value={slaText || "—"}
            valueClassName={sla.anyOverdue ? "text-red-500" : undefined}
          />
          <Row label="Assigned" value={agentName ?? "Unassigned"} />
          <Row label="Last reply" value={lastRepliedName ?? "—"} />
          <Row
            label="First contact"
            value={ageLabel(conversation.created_at)}
          />
          <Row
            label="Last activity"
            value={ageLabel(conversation.last_message_at)}
          />
          <Row
            label="Age"
            value={ageLabel(conversation.created_at)}
          />
          <Row
            label="Customer since"
            value={ageLabel(conversation.contact?.created_at)}
          />
        </dl>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-medium text-foreground ${valueClassName ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}
