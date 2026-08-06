"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ConversationPresenceState = "viewing" | "typing";

export interface ConversationPresencePeer {
  userId: string;
  fullName: string;
  state: ConversationPresenceState;
  /** Client clock when this peer's presence was last observed. */
  lastSeenAt: number;
}

interface TrackPayload {
  userId: string;
  fullName: string;
  state: ConversationPresenceState;
  /** ISO timestamp from the tracking client (heartbeat). */
  ts?: string;
}

interface UseConversationPresenceOptions {
  conversationId: string | null | undefined;
  userId: string | null | undefined;
  fullName: string;
  enabled?: boolean;
}

interface UseConversationPresenceResult {
  /** Other agents currently on this thread (excludes self). */
  peers: ConversationPresencePeer[];
  /** Highest-priority peer for banner copy (typing > viewing). */
  primaryPeer: ConversationPresencePeer | null;
  setTyping: (typing: boolean) => void;
}

/** Re-track interval so closed tabs expire via missing heartbeats. */
const HEARTBEAT_MS = 20_000;
/** Drop peers that have not refreshed within this window. */
const STALE_AFTER_MS = 60_000;

/**
 * Ephemeral per-conversation presence via Supabase Realtime Presence.
 * Heartbeat every 20s; peers older than 60s are treated as gone.
 */
export function useConversationPresence({
  conversationId,
  userId,
  fullName,
  enabled = true,
}: UseConversationPresenceOptions): UseConversationPresenceResult {
  const [peers, setPeers] = useState<ConversationPresencePeer[]>([]);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<ConversationPresenceState>("viewing");

  const pruneAndSet = useCallback(
    (raw: ConversationPresencePeer[]) => {
      const now = Date.now();
      const next = raw.filter((p) => now - p.lastSeenAt < STALE_AFTER_MS);
      next.sort((a, b) => {
        if (a.state !== b.state) return a.state === "typing" ? -1 : 1;
        return a.fullName.localeCompare(b.fullName);
      });
      setPeers(next);
    },
    [],
  );

  const syncPeers = useCallback(
    (presenceState: Record<string, TrackPayload[]>) => {
      if (!userId) {
        setPeers([]);
        return;
      }
      const now = Date.now();
      const next: ConversationPresencePeer[] = [];
      for (const metas of Object.values(presenceState)) {
        for (const meta of metas) {
          if (!meta?.userId || meta.userId === userId) continue;
          const fromTs = meta.ts ? Date.parse(meta.ts) : NaN;
          next.push({
            userId: meta.userId,
            fullName: meta.fullName || "Agent",
            state: meta.state === "typing" ? "typing" : "viewing",
            lastSeenAt: Number.isFinite(fromTs) ? fromTs : now,
          });
        }
      }
      pruneAndSet(next);
    },
    [userId, pruneAndSet],
  );

  const track = useCallback(
    async (state: ConversationPresenceState) => {
      const channel = channelRef.current;
      if (!channel || !userId) return;
      stateRef.current = state;
      await channel.track({
        userId,
        fullName: fullName || "Agent",
        state,
        ts: new Date().toISOString(),
      } satisfies TrackPayload);
    },
    [userId, fullName],
  );

  useEffect(() => {
    if (!enabled || !conversationId || !userId) {
      setPeers([]);
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`conversation-presence:${conversationId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        syncPeers(channel.presenceState() as Record<string, TrackPayload[]>);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await track("viewing");
        }
      });

    heartbeatRef.current = setInterval(() => {
      void track(stateRef.current);
      // Re-prune locally even if no sync event arrives.
      setPeers((prev) => {
        const now = Date.now();
        const kept = prev.filter((p) => now - p.lastSeenAt < STALE_AFTER_MS);
        return kept.length === prev.length ? prev : kept;
      });
    }, HEARTBEAT_MS);

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setPeers([]);
    };
  }, [enabled, conversationId, userId, syncPeers, track]);

  useEffect(() => {
    if (!channelRef.current || !userId) return;
    void track(stateRef.current);
  }, [fullName, userId, track]);

  const setTyping = useCallback(
    (typing: boolean) => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (typing) {
        void track("typing");
        typingTimerRef.current = setTimeout(() => {
          void track("viewing");
        }, 2500);
      } else {
        void track("viewing");
      }
    },
    [track],
  );

  const primaryPeer = useMemo(() => peers[0] ?? null, [peers]);

  return { peers, primaryPeer, setTyping };
}
