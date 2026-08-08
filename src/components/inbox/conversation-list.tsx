"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  matchesContactFilters,
  matchesInboxFilter,
  matchesInboxSearch,
  normalizeConversations,
  sortConversations,
  isSnoozed,
  type InboxFilter,
} from "@/lib/inbox/conversations";
import { computeInboxAnalytics } from "@/lib/inbox/analytics";
import { formatInboxListTime } from "@/lib/inbox/format-time";
import { slaPatchOnResolved } from "@/lib/inbox/sla";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag } from "@/types";
import {
  Search,
  ChevronDown,
  X,
  Pin,
  Star,
  CheckSquare,
  Square,
  Download,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  onConversationPatch?: (
    conversationId: string,
    patch: Partial<Conversation>,
  ) => void;
  onCloseActive?: () => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  resolved: "bg-emerald-500",
  closed: "bg-muted-foreground",
  spam: "bg-red-500",
};

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  onConversationPatch,
  onCloseActive,
  resyncToken = 0,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  const { user, accountId } = useAuth();
  const currentUserId = user?.id ?? null;
  const searchInputRef = useRef<HTMLInputElement>(null);

  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(
    () => [
      { label: t("filterAll"), value: "all" },
      { label: t("filterUnread"), value: "unread" },
      { label: t("filterMine"), value: "mine" },
      { label: t("filterAssigned"), value: "assigned" },
      { label: t("filterUnassigned"), value: "unassigned" },
      { label: t("filterStarred"), value: "starred" },
      { label: t("filterPinned"), value: "pinned" },
      { label: t("filterSnoozed"), value: "snoozed" },
      { label: t("filterOpen"), value: "open" },
      { label: t("filterPending"), value: "pending" },
      { label: t("filterResolved"), value: "resolved" },
      { label: t("filterClosed"), value: "closed" },
      { label: t("filterSpam"), value: "spam" },
      { label: t("filterWaiting"), value: "waiting" },
      { label: t("filterAi"), value: "ai" },
      { label: t("filterCampaign"), value: "campaign" },
      { label: t("filterBroadcast"), value: "broadcast" },
      { label: t("filterSessionActive"), value: "session_active" },
      { label: t("filterSessionExpired"), value: "session_expired" },
      { label: t("filterVip"), value: "vip" },
    ],
    [t],
  );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [broadcastContactIds, setBroadcastContactIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Extra conversation ids matched via message / notes / deals search. */
  const [deepMatchIds, setDeepMatchIds] = useState<Set<string> | null>(null);
  /** Tick so snoozed rows reappear when their timer expires. */
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/inbox/conversations");
        if (cancelled) return;
        if (!res.ok) {
          console.error("Failed to fetch conversations:", res.status);
          setLoading(false);
          return;
        }
        const json = await res.json();
        onConversationsLoadedRef.current(
          sortConversations(
            normalizeConversations(json.conversations ?? []),
          ),
        );
      } catch (err) {
        console.error("Failed to fetch conversations:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resyncToken]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load broadcast audience contact ids when Campaign/Broadcast filter is on.
  useEffect(() => {
    if (filter !== "campaign" && filter !== "broadcast") {
      setBroadcastContactIds(new Set());
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("broadcast_recipients")
        .select("contact_id")
        .limit(5000);
      if (cancelled || !data) return;
      setBroadcastContactIds(
        new Set(
          data
            .map((r: { contact_id: string | null }) => r.contact_id)
            .filter((id): id is string => !!id),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  // Deep search: message text, deal titles, notes — debounce to avoid
  // hammering Supabase on every keystroke.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setDeepMatchIds(null);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    const timer = setTimeout(async () => {
      const pattern = `%${q}%`;
      const [msgRes, noteRes, dealRes] = await Promise.all([
        supabase
          .from("messages")
          .select("conversation_id")
          .ilike("content_text", pattern)
          .limit(100),
        supabase
          .from("contact_notes")
          .select("contact_id")
          .ilike("note_text", pattern)
          .limit(100),
        supabase
          .from("deals")
          .select("contact_id")
          .ilike("title", pattern)
          .limit(100),
      ]);
      if (cancelled) return;

      const contactIds = new Set<string>();
      for (const row of noteRes.data ?? []) {
        if (row.contact_id) contactIds.add(row.contact_id as string);
      }
      for (const row of dealRes.data ?? []) {
        if (row.contact_id) contactIds.add(row.contact_id as string);
      }

      const convIds = new Set<string>();
      for (const row of msgRes.data ?? []) {
        if (row.conversation_id) convIds.add(row.conversation_id as string);
      }
      for (const c of conversations) {
        if (c.contact_id && contactIds.has(c.contact_id)) convIds.add(c.id);
      }
      setDeepMatchIds(convIds);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, conversations]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const tag of tags) m.set(tag.id, tag);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    const now = new Date(nowTick);
    let result = conversations;

    // Hide snoozed from the default list unless viewing the Snoozed filter.
    if (filter !== "snoozed") {
      result = result.filter((c) => !isSnoozed(c, now));
    }

    result = result.filter((c) =>
      matchesInboxFilter(c, filter, currentUserId, {
        broadcastContactIds,
        now,
      }),
    );

    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        }),
      );
    }

    if (search.trim()) {
      result = result.filter(
        (c) =>
          matchesInboxSearch(c, search) ||
          (deepMatchIds?.has(c.id) ?? false),
      );
    }

    return sortConversations(result);
  }, [
    conversations,
    filter,
    search,
    selectedTagIds,
    selectedCompany,
    currentUserId,
    broadcastContactIds,
    deepMatchIds,
    nowTick,
  ]);

  const analytics = useMemo(
    () => computeInboxAnalytics(conversations, new Date(nowTick)),
    [conversations, nowTick],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(filtered.map((c) => c.id));
  }, [filtered]);

  const applyBulkPatch = useCallback(
    async (patch: Partial<Conversation>) => {
      if (selectedIds.length === 0) return;
      setBulkBusy(true);
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update(patch)
        .in("id", selectedIds);
      setBulkBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      for (const id of selectedIds) {
        onConversationPatch?.(id, patch);
      }
      clearSelection();
    },
    [selectedIds, onConversationPatch, clearSelection],
  );

  const bulkAssignMe = useCallback(async () => {
    if (!currentUserId) return;
    const nowIso = new Date().toISOString();
    await applyBulkPatch({
      assigned_agent_id: currentUserId,
      assigned_by: currentUserId,
      assigned_at: nowIso,
    });
  }, [applyBulkPatch, currentUserId]);

  const bulkUnassign = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("conversations")
      .update({
        assigned_agent_id: null,
        assigned_by: null,
        assigned_at: null,
      })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    for (const id of selectedIds) {
      onConversationPatch?.(id, {
        assigned_agent_id: undefined,
        assigned_by: null,
        assigned_at: null,
      });
    }
    clearSelection();
  }, [selectedIds, onConversationPatch, clearSelection]);

  const bulkResolve = useCallback(async () => {
    await applyBulkPatch({
      status: "resolved",
      ...slaPatchOnResolved(),
    });
  }, [applyBulkPatch]);

  const bulkClose = useCallback(async () => {
    await applyBulkPatch({
      status: "closed",
      ...slaPatchOnResolved(),
    });
  }, [applyBulkPatch]);

  const bulkSpam = useCallback(async () => {
    await applyBulkPatch({ status: "spam" });
  }, [applyBulkPatch]);

  const bulkAddTag = useCallback(
    async (tagId: string) => {
      if (!accountId || selectedIds.length === 0) return;
      setBulkBusy(true);
      const supabase = createClient();
      const contactIds = conversations
        .filter((c) => selectedIds.includes(c.id) && c.contact_id)
        .map((c) => c.contact_id);
      const unique = [...new Set(contactIds)];
      const rows = unique.map((contact_id) => ({
        contact_id,
        tag_id: tagId,
      }));
      const { error } = await supabase.from("contact_tags").upsert(rows, {
        onConflict: "contact_id,tag_id",
        ignoreDuplicates: true,
      });
      setBulkBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("bulkTagged", { count: unique.length }));
      clearSelection();
    },
    [accountId, selectedIds, conversations, clearSelection, t],
  );

  const bulkExportCsv = useCallback(() => {
    const rows = conversations.filter((c) => selectedIds.includes(c.id));
    const header = [
      "id",
      "status",
      "contact_name",
      "phone",
      "unread",
      "last_message_at",
      "assigned_agent_id",
    ];
    const lines = [
      header.join(","),
      ...rows.map((c) =>
        [
          c.id,
          c.status,
          JSON.stringify(c.contact?.name ?? ""),
          JSON.stringify(c.contact?.phone ?? ""),
          c.unread_count ?? 0,
          c.last_message_at ?? "",
          c.assigned_agent_id ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inbox-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [conversations, selectedIds]);

  // Keyboard: Ctrl/Cmd+K search, Esc close, j/k or arrows list nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        if (selectedIds.length > 0) {
          clearSelection();
          return;
        }
        if (!typing) onCloseActive?.();
        return;
      }

      if (typing) return;

      if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (filtered.length === 0) return;
        const idx = filtered.findIndex((c) => c.id === activeConversationId);
        const next =
          e.key === "j" || e.key === "ArrowDown"
            ? Math.min(filtered.length - 1, Math.max(0, idx) + (idx < 0 ? 0 : 1))
            : Math.max(0, (idx < 0 ? 0 : idx) - 1);
        onSelect(filtered[next]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    filtered,
    activeConversationId,
    onSelect,
    onCloseActive,
    selectedIds.length,
    clearSelection,
  ]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id],
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    [],
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect],
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-card lg:w-80">
      {/* Analytics strip */}
      <div className="grid grid-cols-4 gap-1 border-b border-border px-2 py-1.5 text-[10px] tabular-nums text-muted-foreground">
        <div title={t("analyticsOpen")}>
          <span className="block font-semibold text-foreground">{analytics.open}</span>
          {t("analyticsOpenShort")}
        </div>
        <div title={t("analyticsUnread")}>
          <span className="block font-semibold text-foreground">{analytics.unread}</span>
          {t("analyticsUnreadShort")}
        </div>
        <div title={t("analyticsPending")}>
          <span className="block font-semibold text-foreground">{analytics.pending}</span>
          {t("analyticsPendingShort")}
        </div>
        <div title={t("analyticsSla")}>
          <span
            className={cn(
              "block font-semibold",
              analytics.slaMissed > 0 ? "text-red-500" : "text-foreground",
            )}
          >
            {analytics.slaMissed}
          </span>
          {t("analyticsSlaShort")}
        </div>
        <div title={t("analyticsResolvedToday")} className="col-span-1">
          <span className="block font-semibold text-foreground">
            {analytics.resolvedToday}
          </span>
          {t("analyticsResolvedShort")}
        </div>
        <div title={t("analyticsAvgResponse")} className="col-span-2">
          <span className="block font-semibold text-foreground">
            {analytics.avgFirstResponseMinutes != null
              ? `${analytics.avgFirstResponseMinutes}m`
              : "—"}
          </span>
          {t("analyticsAvgShort")}
        </div>
        <div title={t("analyticsAi")}>
          <span className="block font-semibold text-foreground">{analytics.aiActive}</span>
          {t("analyticsAiShort")}
        </div>
      </div>

      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/50 p-1.5">
            <span className="px-1 text-[11px] font-medium text-foreground">
              {t("bulkSelected", { count: selectedIds.length })}
            </span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkAssignMe}
              className="rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-muted"
            >
              {t("bulkAssignMe")}
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkUnassign}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("bulkUnassign")}
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkResolve}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("bulkResolve")}
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkClose}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("bulkClose")}
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkSpam}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("bulkSpam")}
            </button>
            {tags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                  {t("bulkTag")}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="border-border bg-popover">
                  {tags.map((tag) => (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => void bulkAddTag(tag.id)}
                      className="text-sm"
                    >
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              type="button"
              onClick={bulkExportCsv}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3 w-3" />
              {t("bulkExport")}
            </button>
            <button
              type="button"
              onClick={selectAllFiltered}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("bulkSelectAll")}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("bulkClear")}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              {activeFilter?.label ?? t("filterAll")}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "text-sm",
                    filter === opt.value
                      ? "text-primary"
                      : "text-popover-foreground",
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>


          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs hover:bg-muted",
                  selectedTagIds.length > 0
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("tags")}
                {selectedTagIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                {tags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={selectedTagIds.includes(tag.id)}
                    onCheckedChange={() => toggleTag(tag.id)}
                    className="text-sm text-popover-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex h-7 max-w-40 items-center justify-center gap-1 rounded-md px-2 text-xs hover:bg-muted",
                  selectedCompany
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">
                  {selectedCompany ?? t("company")}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    "text-sm",
                    selectedCompany === null
                      ? "text-primary"
                      : "text-popover-foreground",
                  )}
                >
                  {t("allCompanies")}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      "text-sm",
                      selectedCompany === co
                        ? "text-primary"
                        : "text-popover-foreground",
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: tag?.color ?? "var(--muted-foreground)",
                    }}
                  />
                  <span className="max-w-24 truncate">
                    {tag?.name ?? t("tags")}
                  </span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                type="button"
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              {t("noConversations")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Next: Connect WhatsApp, then send a test message to open your first chat.
            </p>
            <a
              href="/settings?tab=whatsapp"
              className="mt-3 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Connect WhatsApp
            </a>
          </div>
        ) : (
          <div className="flex flex-col" role="list">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                isSelected={selectedIds.includes(conv.id)}
                onToggleSelect={toggleSelected}
                onSelect={handleSelect}
                t={t}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  isSelected,
  onToggleSelect,
  onSelect,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const initials = displayName.charAt(0).toUpperCase();
  const unread = conversation.unread_count ?? 0;

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleSelect(conversation.id);
    },
    [onToggleSelect, conversation.id],
  );

  const timeLabel = formatInboxListTime(conversation.last_message_at);

  return (
    <div
      role="listitem"
      className={cn(
        "flex w-full items-start gap-2 px-2 py-3 text-left transition-colors hover:bg-muted/50",
        isActive && "border-l-2 border-primary bg-muted/70",
        unread > 0 && !isActive && "bg-primary/[0.03]",
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-label={isSelected ? t("bulkDeselectRow") : t("bulkSelectRow")}
        className="mt-2 shrink-0 text-muted-foreground hover:text-foreground"
      >
        {isSelected ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={handleClick}
        aria-current={isActive ? "true" : undefined}
        aria-label={
          unread > 0
            ? `${displayName}, ${unread} unread`
            : displayName
        }
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
        {conversation.is_pinned && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-card p-0.5 text-muted-foreground">
            <Pin className="h-2.5 w-2.5" aria-hidden />
          </span>
        )}
        {conversation.is_starred && !conversation.is_pinned && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-card p-0.5 text-amber-500">
            <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm text-foreground",
              unread > 0 ? "font-semibold" : "font-medium",
            )}
          >
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {timeLabel}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conversation.last_message_text || t("noMessagesYet")}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {unread > 0 && (
              <span
                aria-label={`${unread} unread`}
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_COLORS[conversation.status],
              )}
              title={conversation.status}
              aria-hidden
            />
          </div>
        </div>
      </div>
      </button>
    </div>
  );
}
