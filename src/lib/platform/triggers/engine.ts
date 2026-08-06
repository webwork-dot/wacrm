/**
 * Trigger Engine — entrypoints that start Automation Runtime (later).
 * Subscribes to Event Bus where appropriate; future triggers plug in here.
 */

import { publish, subscribe, type PlatformEventType } from "@/lib/platform/event-bus";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TriggerType =
  | "whatsapp"
  | "webhook"
  | "schedule"
  | "manual"
  | "api"
  | "crm"
  | "payment"
  | "conversation";

export interface TriggerPayload {
  accountId: string;
  triggerType: TriggerType;
  /** Optional bus event that caused this trigger. */
  sourceEvent?: PlatformEventType;
  data: Record<string, unknown>;
}

type TriggerHandler = (payload: TriggerPayload) => void | Promise<void>;

const triggerHandlers = new Map<TriggerType, Set<TriggerHandler>>();

export function registerTriggerHandler(
  type: TriggerType,
  handler: TriggerHandler,
): () => void {
  let set = triggerHandlers.get(type);
  if (!set) {
    set = new Set();
    triggerHandlers.set(type, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
  };
}

export async function dispatchTrigger(
  payload: TriggerPayload,
): Promise<void> {
  const set = triggerHandlers.get(payload.triggerType);
  if (!set || set.size === 0) {
    // No handlers registered — WhatsApp inbound still runs via the
    // webhook → dispatchInboundToFlows (IR) sync path.
    return;
  }
  await Promise.all(
    [...set].map(async (h) => {
      try {
        await h(payload);
      } catch (err) {
        console.error("[trigger-engine] handler failed:", payload.triggerType, err);
      }
    }),
  );
}

/** Map bus events → trigger types (loose coupling). */
const BUS_TO_TRIGGER: Partial<Record<string, TriggerType>> = {
  "whatsapp.message.received": "whatsapp",
  "conversation.assigned": "conversation",
  "conversation.created": "conversation",
  "customer.created": "crm",
  "payment.received": "payment",
  "order.created": "payment",
};

let busWired = false;

/** Call once at process boot (webhook / cron / server). Idempotent. */
export function wireTriggerEngineToEventBus(): void {
  if (busWired) return;
  busWired = true;
  subscribe("*", async (event) => {
    const triggerType = BUS_TO_TRIGGER[event.type];
    if (!triggerType) return;
    await dispatchTrigger({
      accountId: event.accountId,
      triggerType,
      sourceEvent: event.type,
      data: event.payload,
    });
  });
}

/** Convenience: publish bus event + let Trigger Engine react. */
export async function emitAndTrigger(
  db: SupabaseClient | undefined,
  accountId: string,
  eventType: PlatformEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  wireTriggerEngineToEventBus();
  await publish(accountId, eventType, payload, db);
}
