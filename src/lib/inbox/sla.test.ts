import { describe, expect, it } from "vitest";
import {
  formatSlaCountdown,
  getSlaSnapshot,
  slaPatchOnAgentReply,
  slaPatchOnCustomerMessage,
  slaPatchOnResolved,
} from "./sla";

describe("slaPatchOnCustomerMessage", () => {
  it("sets first and next response dues when never responded", () => {
    const now = new Date("2026-08-06T10:00:00.000Z");
    const patch = slaPatchOnCustomerMessage(
      {
        first_responded_at: null,
        first_response_due_at: null,
        resolution_due_at: null,
      },
      {
        first_response_minutes: 15,
        next_response_minutes: 60,
        resolution_minutes: 1440,
      },
      now,
    );
    expect(patch.first_response_due_at).toBe("2026-08-06T10:15:00.000Z");
    expect(patch.next_response_due_at).toBe("2026-08-06T11:00:00.000Z");
    expect(patch.resolution_due_at).toBe("2026-08-07T10:00:00.000Z");
  });

  it("does not reset first due after it was already set", () => {
    const patch = slaPatchOnCustomerMessage(
      {
        first_responded_at: null,
        first_response_due_at: "2026-08-06T10:15:00.000Z",
        resolution_due_at: "2026-08-07T10:00:00.000Z",
      },
      {
        first_response_minutes: 15,
        next_response_minutes: 30,
        resolution_minutes: 1440,
      },
      new Date("2026-08-06T10:20:00.000Z"),
    );
    expect(patch.first_response_due_at).toBeUndefined();
    expect(patch.next_response_due_at).toBe("2026-08-06T10:50:00.000Z");
  });
});

describe("slaPatchOnAgentReply", () => {
  it("clears next due and records first response once", () => {
    const now = new Date("2026-08-06T10:05:00.000Z");
    const patch = slaPatchOnAgentReply(
      { first_responded_at: null },
      now,
    );
    expect(patch.next_response_due_at).toBeNull();
    expect(patch.first_responded_at).toBe(now.toISOString());
    expect(patch.first_response_due_at).toBeNull();
  });
});

describe("slaPatchOnResolved", () => {
  it("clears SLA clocks", () => {
    const patch = slaPatchOnResolved(new Date("2026-08-06T12:00:00.000Z"));
    expect(patch.resolved_at).toBe("2026-08-06T12:00:00.000Z");
    expect(patch.next_response_due_at).toBeNull();
    expect(patch.first_response_due_at).toBeNull();
    expect(patch.resolution_due_at).toBeNull();
  });
});

describe("getSlaSnapshot / formatSlaCountdown", () => {
  it("flags overdue first response", () => {
    const snap = getSlaSnapshot(
      {
        first_response_due_at: "2026-08-06T09:00:00.000Z",
        next_response_due_at: null,
        resolution_due_at: null,
        first_responded_at: null,
        resolved_at: null,
      },
      new Date("2026-08-06T10:00:00.000Z"),
    );
    expect(snap.firstOverdue).toBe(true);
    expect(snap.anyOverdue).toBe(true);
    expect(formatSlaCountdown("2026-08-06T09:00:00.000Z", new Date("2026-08-06T10:00:00.000Z"))).toContain(
      "overdue",
    );
  });
});
