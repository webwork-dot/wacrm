import { describe, expect, it } from "vitest";
import { monthWindow } from "./plans";

describe("software plans helpers", () => {
  it("monthWindow starts on UTC month boundary", () => {
    const { start, end } = monthWindow(new Date("2026-08-15T12:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
