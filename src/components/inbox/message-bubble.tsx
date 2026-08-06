"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Sparkles,
} from "lucide-react";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import { InteractivePreview } from "@/components/interactive/interactive-preview";
import { useTranslations } from "next-intl";
import { formatInboxClock } from "@/lib/inbox/format-time";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-muted-foreground" aria-hidden />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" aria-hidden />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" aria-hidden />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" aria-hidden />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-400" aria-hidden />;
    default:
      return null;
  }
}

function statusLabel(
  status: Message["status"],
  t: ReturnType<typeof useTranslations>,
): string {
  switch (status) {
    case "sending":
      return t("statusPending");
    case "sent":
      return t("statusSent");
    case "delivered":
      return t("statusDelivered");
    case "read":
      return t("statusRead");
    case "failed":
      return t("statusFailed");
    default:
      return "";
  }
}

function MediaUnavailable({
  label,
  t,
  onPrimary,
}: {
  label: string;
  t: ReturnType<typeof useTranslations>;
  onPrimary?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-40 w-60 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs",
        onPrimary
          ? "bg-primary-foreground/15 text-primary-foreground/80"
          : "bg-muted/40 text-muted-foreground",
      )}
    >
      <ImageOff className="h-4 w-4 shrink-0" />
      <span>{t("unavailable", { label })}</span>
    </div>
  );
}

/**
 * Renders inbound (Meta proxy) and outbound (Supabase public) chat images.
 * Outbound bubbles sit on `bg-primary`, so we always frame media on a
 * neutral surface — otherwise a slow/failed load looks like a blank
 * purple rectangle (the bubble showing through an empty <img>).
 */
function MediaImage({
  url,
  alt,
  onPrimary,
}: {
  url: string;
  alt: string;
  onPrimary?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const blobRef = useRef<string | null>(null);

  const frameClass = onPrimary
    ? "bg-primary-foreground/15"
    : "bg-muted";

  useEffect(() => {
    let cancelled = false;

    const revokeBlob = () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };

    (async () => {
      if (!url) {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setError(false);
        setLoading(true);
        setSrc(null);
      }

      const isProxy = url.startsWith("/api/whatsapp/media/");
      const shouldFetch =
        isProxy ||
        url.includes("/storage/v1/object/public/") ||
        url.includes("/storage/v1/object/sign/");

      if (shouldFetch) {
        try {
          const res = await fetch(url, {
            credentials: isProxy ? "same-origin" : "omit",
            referrerPolicy: "no-referrer",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (cancelled) return;
          // Accept image/* ; some CDNs omit content-type on public objects.
          if (blob.size === 0) throw new Error("Empty media body");
          revokeBlob();
          const blobUrl = URL.createObjectURL(blob);
          blobRef.current = blobUrl;
          setSrc(blobUrl);
          setLoading(false);
          return;
        } catch {
          if (isProxy) {
            if (!cancelled) {
              setError(true);
              setLoading(false);
            }
            return;
          }
          // Public URL: fall through to direct <img>.
        }
      }

      if (!cancelled) {
        setSrc(url);
        // Spinner stays until onLoad / onError.
      }
    })();

    return () => {
      cancelled = true;
      revokeBlob();
    };
  }, [url]);

  if (error) {
    return (
      <div
        className={cn(
          "flex h-40 w-60 items-center justify-center rounded-lg",
          frameClass,
        )}
      >
        <ImageOff
          className={cn(
            "h-8 w-8",
            onPrimary ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        />
      </div>
    );
  }

  if (loading && !src) {
    return (
      <div
        className={cn(
          "flex h-40 w-60 items-center justify-center rounded-lg",
          frameClass,
        )}
      >
        <div
          className={cn(
            "h-5 w-5 animate-spin rounded-full border-2 border-t-transparent",
            onPrimary ? "border-primary-foreground" : "border-primary",
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn("inline-block overflow-hidden rounded-lg", frameClass)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src ?? ""}
        alt={alt}
        referrerPolicy="no-referrer"
        className="max-h-64 max-w-60 object-cover"
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />
    </div>
  );
}

function MessageContent({
  message,
  t,
  onPrimary,
}: {
  message: Message;
  t: ReturnType<typeof useTranslations>;
  onPrimary?: boolean;
}) {
  switch (message.content_type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text}
        </p>
      );

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImage
              url={message.media_url}
              alt="Shared image"
              onPrimary={onPrimary}
            />
          ) : (
            <MediaUnavailable label={t("photo")} t={t} onPrimary={onPrimary} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <video
              src={message.media_url}
              controls
              playsInline
              className="max-h-64 max-w-60 rounded-lg bg-black/20"
            />
          ) : (
            <MediaUnavailable label={t("video")} t={t} onPrimary={onPrimary} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <audio src={message.media_url} controls className="max-w-60" />
          ) : (
            <MediaUnavailable label={t("audio")} t={t} />
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || t("document")} t={t} />;
      }
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {message.content_text || t("document")}
          </span>
        </a>
      );

    case "template":
      return (
        <div>
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <LayoutTemplate className="h-3 w-3" />
            {t("template")}
          </span>
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || t("locationShared")}</span>
        </div>
      );

    case "interactive": {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return <InteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === "customer") {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              {t("buttonReply")}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm">
              {message.content_text || t("interactiveReply")}
            </p>
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("interactiveReply")}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("unsupported")}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
}: MessageBubbleProps) {
  const t = useTranslations("Inbox.bubble");

  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = formatInboxClock(message.created_at);
  const deliveryLabel = isAgent ? statusLabel(message.status, t) : "";

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl px-3 py-2",
          isAgent
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent message={message} t={t} onPrimary={isAgent} />
        <div
          className={cn(
            "mt-1 flex items-center gap-1",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          {message.ai_generated && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/20 px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-primary-foreground"
              title={t("aiBadgeTitle")}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t("aiBadge")}
            </span>
          )}
          <span
            className={cn(
              "text-[10px] tabular-nums",
              isAgent ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[10px]",
                isAgent ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
              title={deliveryLabel}
              aria-label={deliveryLabel}
            >
              <StatusIcon status={message.status} />
              <span className="sr-only sm:not-sr-only sm:inline">
                {deliveryLabel}
              </span>
            </span>
          )}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
