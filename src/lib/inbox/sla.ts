import type { Conversation, InboxSettings } from "@/types";

export const DEFAULT_INBOX_SETTINGS: Pick<
  InboxSettings,
  "first_response_minutes" | "next_response_minutes" | "resolution_minutes"
> = {
  first_response_minutes: 15,
  next_response_minutes: 60,
  resolution_minutes: 1440,
};

export interface SlaSnapshot {
  firstDueAt: string | null;
  nextDueAt: string | null;
  resolutionDueAt: string | null;
  firstOverdue: boolean;
  nextOverdue: boolean;
  resolutionOverdue: boolean;
  anyOverdue: boolean;
}

function addMinutes(isoOrDate: string | Date, minutes: number): string {
  const d =
    typeof isoOrDate === "string" ? new Date(isoOrDate) : new Date(isoOrDate);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

/** Patch applied when a customer message arrives (opens/extends SLA clocks). */
export function slaPatchOnCustomerMessage(
  conversation: Pick<
    Conversation,
    "first_responded_at" | "first_response_due_at" | "resolution_due_at"
  >,
  settings: Pick<
    InboxSettings,
    "first_response_minutes" | "next_response_minutes" | "resolution_minutes"
  >,
  now: Date = new Date(),
): Partial<Conversation> {
  const nowIso = now.toISOString();
  const patch: Partial<Conversation> = {
    next_response_due_at: addMinutes(now, settings.next_response_minutes),
  };

  if (!conversation.first_responded_at && !conversation.first_response_due_at) {
    patch.first_response_due_at = addMinutes(
      now,
      settings.first_response_minutes,
    );
  }

  if (!conversation.resolution_due_at) {
    patch.resolution_due_at = addMinutes(now, settings.resolution_minutes);
  }

  // Touch updated clock for resolution window start if never set.
  void nowIso;
  return patch;
}

/** Patch applied when an agent successfully replies. */
export function slaPatchOnAgentReply(
  conversation: Pick<Conversation, "first_responded_at">,
  now: Date = new Date(),
): Partial<Conversation> {
  const nowIso = now.toISOString();
  const patch: Partial<Conversation> = {
    next_response_due_at: null,
  };
  if (!conversation.first_responded_at) {
    patch.first_responded_at = nowIso;
    patch.first_response_due_at = null;
  }
  return patch;
}

/** Patch when conversation is marked resolved/closed. */
export function slaPatchOnResolved(now: Date = new Date()): Partial<Conversation> {
  return {
    resolved_at: now.toISOString(),
    next_response_due_at: null,
    first_response_due_at: null,
    resolution_due_at: null,
  };
}

export function getSlaSnapshot(
  conversation: Pick<
    Conversation,
    | "first_response_due_at"
    | "next_response_due_at"
    | "resolution_due_at"
    | "first_responded_at"
    | "resolved_at"
  >,
  now: Date = new Date(),
): SlaSnapshot {
  const t = now.getTime();
  const firstDue = conversation.first_responded_at
    ? null
    : conversation.first_response_due_at ?? null;
  const nextDue = conversation.next_response_due_at ?? null;
  const resDue = conversation.resolved_at
    ? null
    : conversation.resolution_due_at ?? null;

  const firstOverdue = !!firstDue && Date.parse(firstDue) < t;
  const nextOverdue = !!nextDue && Date.parse(nextDue) < t;
  const resolutionOverdue = !!resDue && Date.parse(resDue) < t;

  return {
    firstDueAt: firstDue,
    nextDueAt: nextDue,
    resolutionDueAt: resDue,
    firstOverdue,
    nextOverdue,
    resolutionOverdue,
    anyOverdue: firstOverdue || nextOverdue || resolutionOverdue,
  };
}

export function formatSlaCountdown(
  dueAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!dueAt) return "";
  const ms = Date.parse(dueAt) - now.getTime();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60_000);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  const label =
    hours > 0 ? `${hours}h ${remMins}m` : `${Math.max(1, remMins)}m`;
  return overdue ? `${label} overdue` : `${label} left`;
}
