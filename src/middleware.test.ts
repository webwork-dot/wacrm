import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyAccessToken = vi.fn();

vi.mock("@/lib/auth/jwt", () => ({
  verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
}));

const { middleware } = await import("./middleware");
const { SESSION_COOKIE, REFRESH_COOKIE } = await import(
  "@/lib/auth/session-constants"
);

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars!!";
  verifyAccessToken.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("middleware — native JWT session gate", () => {
  it("redirects a signed-in user off /login to /dashboard", async () => {
    verifyAccessToken.mockResolvedValue({
      sub: "user-1",
      email: "a@b.co",
    });

    const req = new NextRequest("https://app.test/login");
    req.cookies.set(SESSION_COOKIE, "valid-access");
    req.cookies.set(REFRESH_COOKIE, "valid-refresh");

    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("redirects an unauth user from protected paths to /login", async () => {
    verifyAccessToken.mockResolvedValue(null);

    const res = await middleware(
      new NextRequest("https://app.test/dashboard"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain("next=%2Fdashboard");
  });

  it("returns 401 for unauth WhatsApp API calls (except webhook)", async () => {
    verifyAccessToken.mockResolvedValue(null);

    const res = await middleware(
      new NextRequest("https://app.test/api/whatsapp/config"),
    );

    expect(res.status).toBe(401);
  });

  it("allows WhatsApp webhook without a session", async () => {
    verifyAccessToken.mockResolvedValue(null);

    const res = await middleware(
      new NextRequest("https://app.test/api/whatsapp/webhook"),
    );

    expect(res.status).toBe(200);
  });
});
