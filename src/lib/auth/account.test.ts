import { afterEach, describe, expect, it, vi } from "vitest";

// getCurrentAccount resolves the caller's account context via
// getRequestUser() + raw SQL (plain PostgreSQL). No PostgREST embeds.

const getRequestUser = vi.fn();
const query = vi.fn();
const dbAdmin = vi.fn(() => ({ __db: true }));

vi.mock("@/lib/auth/session-cookies", () => ({
  getRequestUser: () => getRequestUser(),
}));

vi.mock("@/lib/db/pool", () => ({
  query: (...args: unknown[]) => query(...args),
}));

vi.mock("@/lib/db/client", () => ({
  dbAdmin: () => dbAdmin(),
}));

const { getCurrentAccount, UnauthorizedError, ForbiddenError } = await import(
  "./account"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentAccount", () => {
  it("resolves context via plain profiles + accounts lookups", async () => {
    getRequestUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.co",
      fullName: "A",
    });
    query
      .mockResolvedValueOnce({
        rows: [{ account_id: "acct-1", account_role: "owner" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "acct-1", name: "Acme", status: "active" }],
      });

    const ctx = await getCurrentAccount();

    expect(ctx).toMatchObject({
      userId: "user-1",
      accountId: "acct-1",
      role: "owner",
      account: { id: "acct-1", name: "Acme" },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toMatch(/FROM profiles/i);
    expect(String(query.mock.calls[1][0])).toMatch(/FROM accounts/i);
    expect(query.mock.calls[0][0]).not.toMatch(/accounts!/);
  });

  it("throws UnauthorizedError when there is no session", async () => {
    getRequestUser.mockResolvedValue(null);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a profile not linked to an account", async () => {
    getRequestUser.mockResolvedValue({ id: "user-1", email: "a@b.co", fullName: "A" });
    query.mockResolvedValueOnce({ rows: [{ account_id: null, account_role: null }] });
    await expect(getCurrentAccount()).rejects.toThrow(
      "Profile is not linked to an account",
    );
  });

  it("rejects an unknown account role", async () => {
    getRequestUser.mockResolvedValue({ id: "user-1", email: "a@b.co", fullName: "A" });
    query.mockResolvedValueOnce({
      rows: [{ account_id: "acct-1", account_role: "superuser" }],
    });
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an account_id that resolves to no readable account", async () => {
    getRequestUser.mockResolvedValue({ id: "user-1", email: "a@b.co", fullName: "A" });
    query
      .mockResolvedValueOnce({
        rows: [{ account_id: "acct-1", account_role: "owner" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    await expect(getCurrentAccount()).rejects.toThrow(
      "Profile is not linked to an account",
    );
  });

  it("rejects a suspended account", async () => {
    getRequestUser.mockResolvedValue({ id: "user-1", email: "a@b.co", fullName: "A" });
    query
      .mockResolvedValueOnce({
        rows: [{ account_id: "acct-1", account_role: "owner" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "acct-1", name: "Acme", status: "suspended" }],
      });
    await expect(getCurrentAccount()).rejects.toThrow("Account is suspended");
  });
});
