"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Conversation, ConversationEvent } from "@/types";
import { formatInboxListTime, formatInboxDayLabel } from "@/lib/inbox/format-time";
import { Loader2 } from "lucide-react";

interface ConversationTimelineProps {
  conversation: Conversation;
}

function eventLabel(ev: ConversationEvent, actorName?: string | null): string {
  const payload = ev.payload ?? {};
  const by = actorName ? ` · ${actorName}` : "";
  switch (ev.event_type) {
    case "assigned":
      return `Assigned${payload.to_name ? ` to ${payload.to_name}` : ""}${by}`;
    case "unassigned":
      return `Unassigned${by}`;
    case "status_changed":
      return `Status → ${payload.status ?? "updated"}${by}`;
    case "pinned":
      return `Pinned${by}`;
    case "unpinned":
      return `Unpinned${by}`;
    case "starred":
      return `Starred${by}`;
    case "unstarred":
      return `Unstarred${by}`;
    case "snoozed":
      return `Snoozed${by}`;
    case "unsnoozed":
      return `Snooze cleared${by}`;
    case "replied":
      return `Agent replied${by}`;
    case "ai_replied":
      return "AI replied";
    case "template_sent":
      return `Template sent${payload.name ? `: ${payload.name}` : ""}${by}`;
    case "note_added":
      return `Internal note added${by}`;
    case "resolved":
      return `Conversation resolved${by}`;
    case "created":
      return "Conversation created";
    default:
      return `${String(ev.event_type).replace(/_/g, " ")}${by}`;
  }
}

export function ConversationTimeline({ conversation }: ConversationTimelineProps) {
  const { accountId } = useAuth();
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const { data } = await supabase
      .from("conversation_events")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data as ConversationEvent[]) ?? [];
    setEvents(rows);

    const actorIds = [
      ...new Set(
        rows
          .map((e) => e.actor_user_id)
          .filter((id): id is string => !!id),
      ),
    ];
    if (actorIds.length > 0 && accountId) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("account_id", accountId)
        .in("user_id", actorIds);
      const map = new Map<string, string>();
      for (const p of profiles ?? []) {
        map.set(
          p.user_id as string,
          (p.full_name as string) || (p.email as string) || "Agent",
        );
      }
      setActorNames(map);
    } else {
      setActorNames(new Map());
    }
    setLoading(false);
  }, [conversation.id, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const milestones: { at: string; label: string }[] = [];
  if (conversation.created_at) {
    milestones.push({
      at: conversation.created_at,
      label: "Conversation created",
    });
  }
  if (conversation.contact?.created_at) {
    milestones.push({
      at: conversation.contact.created_at,
      label: `Customer since ${formatInboxDayLabel(conversation.contact.created_at)}`,
    });
  }
  if (conversation.last_customer_message_at) {
    milestones.push({
      at: conversation.last_customer_message_at,
      label: "Last customer message",
    });
  }
  if (conversation.first_responded_at) {
    milestones.push({
      at: conversation.first_responded_at,
      label: "First agent response",
    });
  }
  if (conversation.resolved_at) {
    milestones.push({
      at: conversation.resolved_at,
      label: "Resolved",
    });
  }

  const merged = [
    ...events.map((e) => ({
      id: e.id,
      at: e.created_at,
      label: eventLabel(
        e,
        e.actor_user_id ? actorNames.get(e.actor_user_id) : null,
      ),
    })),
    ...milestones.map((m, i) => ({
      id: `m-${i}-${m.at}`,
      at: m.at,
      label: m.label,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <div>
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Timeline
      </div>
      <div className="mt-2 space-y-2">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : merged.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No activity yet</p>
        ) : (
          merged.slice(0, 40).map((item) => (
            <div key={item.id} className="flex gap-2 px-1 text-xs">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <div className="min-w-0 flex-1">
                <p className="text-foreground">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatInboxListTime(item.at)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
