import { createClient } from "@/lib/supabase/client";
import type { ConversationEventType } from "@/types";

/**
 * Best-effort audit writer for conversation lifecycle events.
 * Failures are logged and swallowed so UI actions never block on audit.
 */
export async function logConversationEvent(params: {
  accountId: string;
  conversationId: string;
  contactId?: string | null;
  eventType: ConversationEventType | string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("conversation_events").insert({
      account_id: params.accountId,
      conversation_id: params.conversationId,
      contact_id: params.contactId ?? null,
      actor_user_id: user?.id ?? null,
      event_type: params.eventType,
      payload: params.payload ?? {},
    });
    if (error) {
      console.error("[conversation-events] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[conversation-events] unexpected error:", err);
  }
}
