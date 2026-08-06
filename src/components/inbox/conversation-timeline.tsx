"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, ConversationEvent } from "@/types";
import { formatInboxListTime, formatInboxDayLabel } from "@/lib/inbox/format-time";
import { Loader2 } from "lucide-react";

interface ConversationTimelineProps {
  conversation: Conversation;
}

function eventLabel(ev: ConversationEvent): string {
  const payload = ev.payload ?? {};
  switch (ev.event_type) {
    case "assigned":
      return `Assigned${payload.to_name ? ` to ${payload.to_name}` : ""}`;
    case "unassigned":
      return "Unassigned";
    case "status_changed":
      return `Status → ${payload.status ?? "updated"}`;
    case "pinned":
      return "Pinned";
    case "unpinned":
      return "Unpinned";
    case "starred":
      return "Starred";
    case "unstarred":
      return "Unstarred";
    case "snoozed":
      return "Snoozed";
    case "unsnoozed":
      return "Snooze cleared";
    case "replied":
      return "Agent replied";
    case "ai_replied":
      return "AI replied";
    case "template_sent":
      return `Template sent${payload.name ? `: ${payload.name}` : ""}`;
    case "note_added":
      return "Internal note added";
    case "resolved":
      return "Conversation resolved";
    case "created":
      return "Conversation created";
    default:
      return String(ev.event_type).replace(/_/g, " ");
  }
}

export function ConversationTimeline({ conversation }: ConversationTimelineProps) {
  const [events, setEvents] = useState<ConversationEvent[]>([]);
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
    setEvents((data as ConversationEvent[]) ?? []);
    setLoading(false);
  }, [conversation.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Synthetic milestones from the conversation row itself.
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
      label: eventLabel(e),
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
