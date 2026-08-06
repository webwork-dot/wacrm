import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatInboxClock,
  formatInboxListTime,
  getCustomerServiceWindow,
} from "./format-time";

describe("formatInboxClock", () => {
  it("uses 12-hour format", () => {
    expect(formatInboxClock("2026-08-06T15:27:00")).toMatch(/3:27\s*PM/i);
    expect(formatInboxClock("2026-08-06T11:05:00")).toMatch(/11:05\s*AM/i);
  });
});

describe("formatInboxListTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows clock for today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T18:00:00"));
    expect(formatInboxListTime("2026-08-06T15:27:00")).toMatch(/3:27\s*PM/i);
  });

  it("shows Yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00"));
    expect(formatInboxListTime("2026-08-05T15:27:00")).toBe("Yesterday");
  });

  it("shows day+month for older this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00"));
    expect(formatInboxListTime("2026-03-05T10:00:00")).toBe("05 Mar");
  });
});

describe("getCustomerServiceWindow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is active within 24h", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    const win = getCustomerServiceWindow("2026-08-06T00:00:00Z");
    expect(win.expired).toBe(false);
    expect(win.remainingLabel).toMatch(/h .*m left/);
  });

  it("expires after 24h", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:01:00Z"));
    const win = getCustomerServiceWindow("2026-08-06T12:00:00Z");
    expect(win.expired).toBe(true);
    expect(win.remainingLabel).toBe("Session Expired");
  });
});
