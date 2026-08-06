import type { Conversation, Contact, Tag } from "@/types";

/**
 * Conversation select that embeds the contact plus its tags, so the Inbox
 * can filter conversations by contact tag without a second round-trip.
 * `contact_tags(tags(*))` returns the join rows; {@link normalizeConversation}
 * flattens them onto `contact.tags`.
 */
export const CONVERSATION_SELECT =
  "*, contact:contacts(*, contact_tags(tags(*)))";

/** Inbox list filters (WATI / Respond.io style). */
export type InboxFilter =
  | "all"
  | "unread"
  | "mine"
  | "assigned"
  | "open"
  | "resolved"
  | "waiting"
  | "ai"
  | "campaign"
  | "broadcast";

/**
 * Sort for the conversation list:
 * 1. Pinned first
 * 2. Unread above read
 * 3. Latest customer message (fallback: last_message_at)
 */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const pinA = a.is_pinned ? 1 : 0;
    const pinB = b.is_pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;

    const unreadA = (a.unread_count ?? 0) > 0 ? 1 : 0;
    const unreadB = (b.unread_count ?? 0) > 0 ? 1 : 0;
    if (unreadA !== unreadB) return unreadB - unreadA;

    const timeA = Date.parse(
      a.last_customer_message_at || a.last_message_at || a.updated_at || "",
    );
    const timeB = Date.parse(
      b.last_customer_message_at || b.last_message_at || b.updated_at || "",
    );
    return (timeB || 0) - (timeA || 0);
  });
}

/**
 * Local search across name, phone, last message, tags, company, conversation id.
 * Broader note/deal/message-body search is handled by the list when a query runs.
 */
export function matchesInboxSearch(
  conversation: Conversation,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (conversation.id.toLowerCase().includes(q)) return true;

  const contact = conversation.contact;
  const name = contact?.name?.toLowerCase() ?? "";
  const phone = contact?.phone?.toLowerCase() ?? "";
  const email = contact?.email?.toLowerCase() ?? "";
  const company = contact?.company?.toLowerCase() ?? "";
  const lastMsg = conversation.last_message_text?.toLowerCase() ?? "";
  if (
    name.includes(q) ||
    phone.includes(q) ||
    email.includes(q) ||
    company.includes(q) ||
    lastMsg.includes(q)
  ) {
    return true;
  }

  const tags = contact?.tags ?? [];
  if (tags.some((t) => t.name.toLowerCase().includes(q))) return true;

  return false;
}

export function matchesInboxFilter(
  conversation: Conversation,
  filter: InboxFilter,
  currentUserId: string | null,
  opts?: { broadcastContactIds?: Set<string> },
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unread":
      return (conversation.unread_count ?? 0) > 0;
    case "mine":
      return (
        !!currentUserId && conversation.assigned_agent_id === currentUserId
      );
    case "assigned":
      return !!conversation.assigned_agent_id;
    case "open":
      return conversation.status === "open";
    case "resolved":
      return conversation.status === "closed";
    case "waiting":
      return conversation.status === "pending";
    case "ai":
      // Threads the AI bot has actually engaged (or handed off from).
      return (
        (conversation.ai_reply_count ?? 0) > 0 ||
        !!conversation.ai_handoff_summary
      );
    case "campaign":
    case "broadcast": {
      const ids = opts?.broadcastContactIds;
      if (!ids || !conversation.contact_id) return false;
      return ids.has(conversation.contact_id);
    }
    default:
      return true;
  }
}

/** Raw shape returned by {@link CONVERSATION_SELECT} before flattening. */
type RawContact = Contact & { contact_tags?: { tags: Tag | null }[] };
type RawConversation = Omit<Conversation, "contact"> & {
  contact?: RawContact | null;
};

/**
 * Flatten the embedded `contact_tags(tags(*))` join into `contact.tags`.
 * Safe to call on rows fetched with {@link CONVERSATION_SELECT}; a row with
 * no contact (e.g. a freshly-inserted conversation) passes through untouched.
 */
export function normalizeConversation(raw: RawConversation): Conversation {
  const rawContact = raw.contact;
  if (!rawContact) return raw as Conversation;

  const { contact_tags, ...contact } = rawContact;
  return {
    ...raw,
    contact: {
      ...contact,
      tags: (contact_tags ?? [])
        .map((ct) => ct.tags)
        .filter((t): t is Tag => t != null),
    },
  };
}

export function normalizeConversations(
  rows: RawConversation[],
): Conversation[] {
  return rows.map(normalizeConversation);
}

export interface ContactFilters {
  /** Tag ids; a conversation matches if its contact has ANY of them (OR). */
  tagIds: string[];
  /** Exact company match, or null for no company filter. */
  company: string | null;
}

/**
 * Whether a conversation passes the contact-based Inbox filters (issue #272).
 * Empty `tagIds` and null `company` are no-ops, so the default (no filters)
 * always matches. Tags use OR logic, consistent with Broadcast audiences.
 */
export function matchesContactFilters(
  conversation: Conversation,
  { tagIds, company }: ContactFilters,
): boolean {
  if (tagIds.length > 0) {
    const contactTagIds = conversation.contact?.tags ?? [];
    if (!contactTagIds.some((t) => tagIds.includes(t.id))) return false;
  }

  if (company !== null && conversation.contact?.company?.trim() !== company) {
    return false;
  }

  return true;
}
