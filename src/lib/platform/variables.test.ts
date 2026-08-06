import { describe, expect, it } from "vitest";
import {
  buildSystemVars,
  interpolate,
  resolveVariable,
} from "./variables";

describe("variables engine", () => {
  const ctx = {
    customer: { name: "Ada", phone: "1555" },
    conversation: { id: "c1", status: "open" },
    vars: { order_id: "99" },
    system: buildSystemVars({ env: "test" }),
  };

  it("resolves namespaced paths", () => {
    expect(resolveVariable("customer.name", ctx)).toBe("Ada");
    expect(resolveVariable("vars.order_id", ctx)).toBe("99");
    expect(resolveVariable("system.env", ctx)).toBe("test");
  });

  it("interpolates templates", () => {
    expect(
      interpolate("Hi {{ customer.name }}, order {{vars.order_id}}", ctx),
    ).toBe("Hi Ada, order 99");
  });

  it("missing vars become empty string", () => {
    expect(interpolate("x={{missing.path}}", ctx)).toBe("x=");
  });
});
