import {
  differenceInCalendarDays,
  format,
  isThisYear,
  isToday,
  isYesterday,
} from "date-fns";

/**
 * Inbox time labels (12-hour), matching commercial WhatsApp Business UIs:
 *  - Today → "3:27 PM"
 *  - Yesterday → "Yesterday"
 *  - Older this year → "05 Aug"
 *  - Prior years → "05 Aug 2026"
 */
export function formatInboxListTime(
  dateInput: string | Date | null | undefined,
): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return "";

  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  if (isThisYear(date)) return format(date, "dd MMM");
  return format(date, "dd MMM yyyy");
}

/** Clock time on message bubbles / activity rows. Always 12-hour. */
export function formatInboxClock(
  dateInput: string | Date | null | undefined,
): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "h:mm a");
}

/**
 * Relative calendar label for thread date separators and status cards.
 * Today / Yesterday / "05 Aug" / "05 Aug 2026".
 */
export function formatInboxDayLabel(
  dateInput: string | Date | null | undefined,
): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return "";

  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisYear(date)) return format(date, "dd MMM");
  return format(date, "dd MMM yyyy");
}

const SESSION_MS = 24 * 60 * 60 * 1000;

export interface SessionWindow {
  expired: boolean;
  /** Milliseconds remaining in the window (0 when expired). */
  remainingMs: number;
  /** Live countdown like "23h 17m left", or expired copy. */
  remainingLabel: string;
  /** Absolute end of the window, or null if never opened. */
  expiresAt: Date | null;
  /** Whether any customer message has been recorded. */
  hasCustomerMessage: boolean;
}

/**
 * Meta Cloud API customer-service window: free-form replies allowed for
 * 24 hours after the last inbound customer message.
 */
export function getCustomerServiceWindow(
  lastCustomerMessageAt: string | Date | null | undefined,
  now: Date = new Date(),
): SessionWindow {
  if (!lastCustomerMessageAt) {
    return {
      expired: true,
      remainingMs: 0,
      remainingLabel: "No customer messages",
      expiresAt: null,
      hasCustomerMessage: false,
    };
  }

  const start =
    typeof lastCustomerMessageAt === "string"
      ? new Date(lastCustomerMessageAt)
      : lastCustomerMessageAt;
  if (Number.isNaN(start.getTime())) {
    return {
      expired: true,
      remainingMs: 0,
      remainingLabel: "No customer messages",
      expiresAt: null,
      hasCustomerMessage: false,
    };
  }

  const expiresAt = new Date(start.getTime() + SESSION_MS);
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
  const expired = remainingMs <= 0;

  return {
    expired,
    remainingMs,
    remainingLabel: expired
      ? "Session Expired"
      : formatRemaining(remainingMs),
    expiresAt,
    hasCustomerMessage: true,
  };
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  const seconds = Math.max(1, Math.floor(ms / 1000));
  return `${seconds}s left`;
}

/** Days since an ISO timestamp (calendar days), for status cards. */
export function calendarDaysAgo(dateInput: string | Date): number {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return differenceInCalendarDays(new Date(), date);
}
