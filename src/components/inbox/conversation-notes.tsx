"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { ConversationNote, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { formatInboxListTime } from "@/lib/inbox/format-time";
import { logConversationEvent } from "@/lib/inbox/events";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ConversationNotesProps {
  conversationId: string;
  contactId?: string | null;
}

type TeamProfile = Pick<Profile, "user_id" | "full_name" | "email">;

/** Very small markdown subset: paragraphs, **bold**, `code`, @Name highlights. */
function renderNoteBody(body: string, mentionNames: Set<string>) {
  const lines = body.split("\n");
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    while (remaining.length > 0) {
      const mentionMatch = remaining.match(/^@([A-Za-z0-9_.\- ]+)/);
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (mentionMatch) {
        const name = mentionMatch[1].trim();
        const isKnown = [...mentionNames].some(
          (n) => n.toLowerCase() === name.toLowerCase(),
        );
        parts.push(
          <span
            key={key++}
            className={cn(
              "rounded px-0.5 font-medium",
              isKnown ? "bg-primary/15 text-primary" : "text-foreground",
            )}
          >
            @{name}
          </span>,
        );
        remaining = remaining.slice(mentionMatch[0].length);
        continue;
      }
      if (boldMatch) {
        parts.push(
          <strong key={key++} className="font-semibold">
            {boldMatch[1]}
          </strong>,
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      if (codeMatch) {
        parts.push(
          <code
            key={key++}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
          >
            {codeMatch[1]}
          </code>,
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }
      const nextSpecial = remaining.search(/(@|\*\*|`)/);
      if (nextSpecial <= 0) {
        parts.push(remaining);
        break;
      }
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
    return (
      <p key={i} className="whitespace-pre-wrap break-words">
        {parts}
      </p>
    );
  });
}

function extractMentions(
  body: string,
  team: TeamProfile[],
): { ids: string[]; names: string[] } {
  const ids: string[] = [];
  const names: string[] = [];
  for (const p of team) {
    const name = (p.full_name || p.email || "").trim();
    if (!name) continue;
    const re = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(body)) {
      ids.push(p.user_id);
      names.push(name);
    }
  }
  return { ids, names };
}

export function ConversationNotes({
  conversationId,
  contactId,
}: ConversationNotesProps) {
  const { accountId, user } = useAuth();
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [team, setTeam] = useState<TeamProfile[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);

  const mentionNames = useMemo(
    () => new Set(team.map((p) => (p.full_name || p.email || "").trim()).filter(Boolean)),
    [team],
  );

  const mentionQuery = useMemo(() => {
    const m = body.match(/@([A-Za-z0-9_.\- ]*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [body]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return team
      .filter((p) => {
        const name = (p.full_name || p.email || "").toLowerCase();
        return name.includes(mentionQuery);
      })
      .slice(0, 5);
  }, [team, mentionQuery]);

  useEffect(() => {
    setMentionOpen(mentionSuggestions.length > 0 && mentionQuery !== null);
  }, [mentionSuggestions, mentionQuery]);

  const load = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    setLoading(true);
    const [notesRes, teamRes] = await Promise.all([
      supabase
        .from("conversation_notes")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("account_id", accountId),
    ]);
    if (notesRes.data) setNotes(notesRes.data as ConversationNote[]);
    if (teamRes.data) setTeam(teamRes.data as TeamProfile[]);
    setLoading(false);
  }, [accountId, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const insertMention = useCallback(
    (p: TeamProfile) => {
      const name = p.full_name || p.email || "Agent";
      setBody((prev) => prev.replace(/@[A-Za-z0-9_.\- ]*$/, `@${name} `));
      setMentionOpen(false);
    },
    [],
  );

  const handleAdd = useCallback(async () => {
    if (!accountId || !user?.id || !body.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { ids } = extractMentions(body, team);
    const { data, error } = await supabase
      .from("conversation_notes")
      .insert({
        account_id: accountId,
        conversation_id: conversationId,
        contact_id: contactId ?? null,
        user_id: user.id,
        body: body.trim(),
        mentions: ids,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error(error?.message ?? "Couldn't save note");
      setSaving(false);
      return;
    }

    setNotes((prev) => [data as ConversationNote, ...prev]);
    setBody("");

    void logConversationEvent({
      accountId,
      conversationId,
      contactId,
      eventType: "note_added",
      payload: { note_id: data.id },
    });

    // Notify mentioned teammates.
    for (const uid of ids) {
      if (uid === user.id) continue;
      const profile = team.find((p) => p.user_id === uid);
      await supabase.rpc("create_inbox_notification", {
        p_account_id: accountId,
        p_user_id: uid,
        p_type: "mention",
        p_title: "You were mentioned in a note",
        p_body: `${user.email ?? "A teammate"} mentioned you${
          profile?.full_name ? "" : ""
        }: ${body.trim().slice(0, 120)}`,
        p_conversation_id: conversationId,
        p_contact_id: contactId ?? null,
      });
    }

    setSaving(false);
  }, [accountId, user, body, team, conversationId, contactId]);

  const authorLabel = useCallback(
    (note: ConversationNote) => {
      const p = team.find((t) => t.user_id === note.user_id);
      return p?.full_name || p?.email || "Agent";
    },
    [team],
  );

  return (
    <div>
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Internal notes
      </div>
      <div className="relative mt-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note… Use @Name to mention. **bold** supported."
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
        />
        {mentionOpen && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {mentionSuggestions.map((p) => (
              <li key={p.user_id}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => insertMention(p)}
                >
                  {p.full_name || p.email}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex justify-end">
          <Button
            size="sm"
            className="h-7 bg-primary px-2 text-xs hover:bg-primary/90"
            onClick={handleAdd}
            disabled={!body.trim() || saving}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No internal notes yet</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-xs text-foreground"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {authorLabel(note)}
                </span>
                <span>
                  {formatInboxListTime(note.created_at)}
                  {note.edited_at ? " · edited" : ""}
                </span>
              </div>
              <div className="space-y-1 text-xs leading-relaxed">
                {renderNoteBody(note.body, mentionNames)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
