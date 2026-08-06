"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ConversationPresenceState = "viewing" | "typing";

export interface ConversationPresencePeer {
  userId: string;
  fullName: string;
  state: ConversationPresenceState;
}

interface TrackPayload {
  userId: string;
  fullName: string;
  state: ConversationPresenceState;
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

/**
 * Ephemeral per-conversation presence via Supabase Realtime Presence.
 * Tracks viewing / typing so agents can avoid colliding on the same thread.
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
  const stateRef = useRef<ConversationPresenceState>("viewing");

  const syncPeers = useCallback(
    (presenceState: Record<string, TrackPayload[]>) => {
      if (!userId) {
        setPeers([]);
        return;
      }
      const next: ConversationPresencePeer[] = [];
      for (const metas of Object.values(presenceState)) {
        for (const meta of metas) {
          if (!meta?.userId || meta.userId === userId) continue;
          next.push({
            userId: meta.userId,
            fullName: meta.fullName || "Agent",
            state: meta.state === "typing" ? "typing" : "viewing",
          });
        }
      }
      // Prefer typing peers first, then stable by name.
      next.sort((a, b) => {
        if (a.state !== b.state) return a.state === "typing" ? -1 : 1;
        return a.fullName.localeCompare(b.fullName);
      });
      setPeers(next);
    },
    [userId],
  );

  const track = useCallback(async (state: ConversationPresenceState) => {
    const channel = channelRef.current;
    if (!channel || !userId) return;
    stateRef.current = state;
    await channel.track({
      userId,
      fullName: fullName || "Agent",
      state,
    } satisfies TrackPayload);
  }, [userId, fullName]);

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

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setPeers([]);
    };
  }, [enabled, conversationId, userId, syncPeers, track]);

  // Re-track when display name changes while already subscribed.
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
        // Fall back to viewing after idle so we don't stick on "replying".
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
