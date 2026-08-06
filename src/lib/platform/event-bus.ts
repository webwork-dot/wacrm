/**
 * Event Bus — modules publish/subscribe; avoid direct coupling.
 * In-process handlers + durable write to platform_events (best-effort).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformEventType =
  | "whatsapp.message.received"
  | "whatsapp.message.sent"
  | "conversation.assigned"
  | "conversation.created"
  | "message.sent"
  | "ai.replied"
  | "broadcast.completed"
  | "workflow.finished"
  | "payment.received"
  | "customer.created"
  | "order.created"
  | string;

export interface PlatformEvent {
  accountId: string;
  type: PlatformEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

type Handler = (event: PlatformEvent) => void | Promise<void>;

const handlers = new Map<string, Set<Handler>>();
const wildcardHandlers = new Set<Handler>();

export function subscribe(
  eventType: PlatformEventType | "*",
  handler: Handler,
): () => void {
  if (eventType === "*") {
    wildcardHandlers.add(handler);
    return () => {
      wildcardHandlers.delete(handler);
    };
  }
  let set = handlers.get(eventType);
  if (!set) {
    set = new Set();
    handlers.set(eventType, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
  };
}

async function notify(event: PlatformEvent): Promise<void> {
  const specific = handlers.get(event.type);
  const list = [
    ...(specific ? [...specific] : []),
    ...wildcardHandlers,
  ];
  await Promise.all(
    list.map(async (h) => {
      try {
        await h(event);
      } catch (err) {
        console.error("[event-bus] handler failed:", event.type, err);
      }
    }),
  );
}

/**
 * Publish an event. Optionally persist to platform_events for audit /
 * future workers. Persistence failures never throw to callers.
 */
export async function publish(
  accountId: string,
  type: PlatformEventType,
  payload: Record<string, unknown> = {},
  db?: SupabaseClient,
): Promise<PlatformEvent> {
  const event: PlatformEvent = {
    accountId,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };

  if (db) {
    try {
      await db.from("platform_events").insert({
        account_id: accountId,
        event_type: type,
        payload,
        created_at: event.createdAt,
      });
    } catch (err) {
      console.error("[event-bus] persist failed:", err);
    }
  }

  await notify(event);
  return event;
}
