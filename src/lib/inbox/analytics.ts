import { isToday } from "date-fns";
import type { Conversation } from "@/types";
import { getSlaSnapshot } from "@/lib/inbox/sla";

export interface InboxAnalytics {
  open: number;
  unread: number;
  pending: number;
  resolvedToday: number;
  avgFirstResponseMinutes: number | null;
  slaMissed: number;
  aiActive: number;
}

/** Cheap aggregates from already-loaded conversations (no extra RPC). */
export function computeInboxAnalytics(
  conversations: Conversation[],
  now: Date = new Date(),
): InboxAnalytics {
  let open = 0;
  let unread = 0;
  let pending = 0;
  let resolvedToday = 0;
  let slaMissed = 0;
  let aiActive = 0;
  const firstResponseMins: number[] = [];

  for (const c of conversations) {
    if (c.status === "open") open += 1;
    if (c.status === "pending") pending += 1;
    if ((c.unread_count ?? 0) > 0) unread += 1;
    if (
      (c.status === "resolved" || c.status === "closed") &&
      c.resolved_at &&
      isToday(new Date(c.resolved_at))
    ) {
      resolvedToday += 1;
    }
    if (getSlaSnapshot(c, now).anyOverdue) slaMissed += 1;
    if (!c.ai_autoreply_disabled && (c.ai_reply_count ?? 0) > 0) {
      aiActive += 1;
    }
    if (c.first_responded_at && c.created_at) {
      const mins =
        (Date.parse(c.first_responded_at) - Date.parse(c.created_at)) / 60_000;
      if (Number.isFinite(mins) && mins >= 0) firstResponseMins.push(mins);
    }
  }

  return {
    open,
    unread,
    pending,
    resolvedToday,
    avgFirstResponseMinutes:
      firstResponseMins.length > 0
        ? Math.round(
            firstResponseMins.reduce((a, b) => a + b, 0) /
              firstResponseMins.length,
          )
        : null,
    slaMissed,
    aiActive,
  };
}
