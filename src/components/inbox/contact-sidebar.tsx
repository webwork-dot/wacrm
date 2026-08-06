"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Contact, Deal, ContactNote, Tag, Conversation } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Clock,
  User,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "next-intl";
import {
  formatInboxListTime,
  formatInboxDayLabel,
  getCustomerServiceWindow,
} from "@/lib/inbox/format-time";

import { ConversationNotes } from "./conversation-notes";
import { ConversationTimeline } from "./conversation-timeline";
import { ConversationInsights } from "./conversation-insights";
import { ConversationWatchers } from "./conversation-watchers";

interface ContactSidebarProps {
  contact: Contact | null;
  conversation?: Conversation | null;
  assignedAgentName?: string | null;
}

export function ContactSidebar({
  contact,
  conversation = null,
  assignedAgentName = null,
}: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");
  const tTimer = useTranslations("Inbox.sessionTimer");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [resolvedAgentName, setResolvedAgentName] = useState<string | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const session = useMemo(
    () =>
      getCustomerServiceWindow(
        conversation?.last_customer_message_at,
        new Date(nowTick),
      ),
    [conversation?.last_customer_message_at, nowTick],
  );

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    const [dealsRes, notesRes, tagsRes, agentRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      conversation?.assigned_agent_id
        ? supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", conversation.assigned_agent_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    setResolvedAgentName(
      (agentRes.data as { full_name?: string } | null)?.full_name ?? null,
    );
  }, [contact, conversation?.assigned_agent_id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();
    const user = authSession?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">
          {tThread("selectConversation")}
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              aria-label={tSidebar("copyPhone")}
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Status card */}
          <div className="my-4 space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <StatusRow
              icon={<Clock className="h-3.5 w-3.5" />}
              label={tSidebar("sessionStatus")}
              value={
                session.expired
                  ? tTimer("expiredShort")
                  : `${tTimer("activeShort")} · ${session.remainingLabel}`
              }
              valueClassName={
                session.expired ? "text-red-500" : "text-emerald-600"
              }
            />
            <StatusRow
              icon={<User className="h-3.5 w-3.5" />}
              label={tSidebar("owner")}
              value={
                assignedAgentName ||
                resolvedAgentName ||
                tSidebar("unassigned")
              }
            />
            <StatusRow
              icon={<TagIcon className="h-3.5 w-3.5" />}
              label={tSidebar("status")}
              value={
                conversation?.status
                  ? conversation.status.charAt(0).toUpperCase() +
                    conversation.status.slice(1)
                  : tSidebar("none")
              }
            />
            <StatusRow
              icon={<StickyNote className="h-3.5 w-3.5" />}
              label={tSidebar("lastMessage")}
              value={
                conversation?.last_message_text
                  ? conversation.last_message_text
                  : tSidebar("none")
              }
            />
            <StatusRow
              icon={<Clock className="h-3.5 w-3.5" />}
              label={tSidebar("lastActivity")}
              value={
                conversation?.last_message_at
                  ? formatInboxListTime(conversation.last_message_at)
                  : tSidebar("none")
              }
            />
            <StatusRow
              icon={<Calendar className="h-3.5 w-3.5" />}
              label={tSidebar("conversationCreated")}
              value={
                conversation?.created_at
                  ? formatInboxDayLabel(conversation.created_at)
                  : tSidebar("none")
              }
            />
            <StatusRow
              icon={<Calendar className="h-3.5 w-3.5" />}
              label={tSidebar("customerSince")}
              value={formatInboxDayLabel(contact.created_at)}
            />
          </div>

          <div className="my-4 border-t border-border" />

          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              {tSidebar("tags")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {tSidebar("noTags")}
                </p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="my-4 border-t border-border" />

          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {tSidebar("deals")}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {tSidebar("noDeals")}
                </p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="my-4 border-t border-border" />

          {conversation && (
            <>
              <div className="my-4 border-t border-border" />
              <ConversationInsights conversation={conversation} />
              <div className="my-4 border-t border-border" />
              <ConversationWatchers conversationId={conversation.id} />
              <div className="my-4 border-t border-border" />
              <ConversationNotes
                conversationId={conversation.id}
                contactId={contact.id}
              />
              <div className="my-4 border-t border-border" />
              <ConversationTimeline conversation={conversation} />
              <div className="my-4 border-t border-border" />
            </>
          )}

          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground"
                  >
                    <p className="whitespace-pre-wrap">{note.note_text}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatInboxListTime(note.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={`truncate text-foreground ${valueClassName ?? ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
