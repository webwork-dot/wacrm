/**
 * Native authentication — public.users + bcrypt + cookie sessions.
 * Framework-independent core; Next.js wires cookies/middleware.
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getPool, query } from "@/lib/db/pool";
import { signAccessToken, verifyAccessToken } from "@/lib/auth/jwt";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/lib/auth/session-constants";

export { REFRESH_COOKIE, SESSION_COOKIE };

const BCRYPT_ROUNDS = 12;

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  isActive: boolean;
};

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  rememberMe: boolean;
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

async function getAuthSetting(key: string, fallback: number): Promise<number> {
  const { rows } = await query<{ value: unknown }>(
    `SELECT value FROM platform_settings WHERE key = $1`,
    [key],
  );
  const v = rows[0]?.value;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

async function loadUserByEmail(email: string) {
  const { rows } = await query<{
    id: string;
    email: string;
    full_name: string;
    encrypted_password: string;
    email_confirmed_at: Date | null;
    last_sign_in_at: Date | null;
    is_active: boolean;
    failed_login_count: number;
    locked_until: Date | null;
  }>(
    `SELECT id, email, full_name, encrypted_password, email_confirmed_at,
            last_sign_in_at, is_active, failed_login_count, locked_until
     FROM users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] ?? null;
}

async function recordLogin(opts: {
  userId?: string | null;
  email: string;
  success: boolean;
  failureReason?: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await query(
    `INSERT INTO login_history (user_id, email, success, failure_reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      opts.userId ?? null,
      opts.email.toLowerCase(),
      opts.success,
      opts.failureReason ?? null,
      opts.ip ?? null,
      opts.userAgent ?? null,
    ],
  );
}

async function writeActivity(opts: {
  accountId?: string | null;
  actorUserId: string;
  eventType: string;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
}) {
  await query(
    `INSERT INTO activity_logs (account_id, actor_user_id, event_type, title, body, meta)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      opts.accountId ?? null,
      opts.actorUserId,
      opts.eventType,
      opts.title,
      opts.body ?? null,
      JSON.stringify(opts.meta ?? {}),
    ],
  );
}

async function writeAudit(opts: {
  userId: string;
  accountId?: string | null;
  module: string;
  action: string;
  ip?: string | null;
  userAgent?: string | null;
  newValue?: Record<string, unknown>;
}) {
  await query(
    `INSERT INTO audit_logs (user_id, account_id, ip_address, user_agent, module, action, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      opts.userId,
      opts.accountId ?? null,
      opts.ip ?? null,
      opts.userAgent ?? null,
      opts.module,
      opts.action,
      JSON.stringify(opts.newValue ?? {}),
    ],
  );
}

export type LoginResult =
  | {
      ok: true;
      user: AuthUser;
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    }
  | { ok: false; error: string; code: "invalid" | "locked" | "inactive" };

export async function loginWithPassword(opts: {
  email: string;
  password: string;
  rememberMe?: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<LoginResult> {
  const email = opts.email.trim().toLowerCase();
  const user = await loadUserByEmail(email);

  if (!user) {
    await recordLogin({
      email,
      success: false,
      failureReason: "unknown_user",
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    return { ok: false, error: "Invalid email or password", code: "invalid" };
  }

  if (!user.is_active) {
    await recordLogin({
      userId: user.id,
      email,
      success: false,
      failureReason: "inactive",
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    return { ok: false, error: "Account is disabled", code: "inactive" };
  }

  if (user.locked_until && user.locked_until > new Date()) {
    await recordLogin({
      userId: user.id,
      email,
      success: false,
      failureReason: "locked",
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    return {
      ok: false,
      error: "Account temporarily locked. Try again later.",
      code: "locked",
    };
  }

  const valid = await verifyPassword(opts.password, user.encrypted_password);
  if (!valid) {
    const maxFails = await getAuthSetting("auth.max_failed_logins", 5);
    const lockMinutes = await getAuthSetting("auth.lockout_minutes", 15);
    const fails = (user.failed_login_count ?? 0) + 1;
    const lockedUntil =
      fails >= maxFails
        ? new Date(Date.now() + lockMinutes * 60_000)
        : null;

    await query(
      `UPDATE users
       SET failed_login_count = $2,
           locked_until = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, fails, lockedUntil],
    );

    await recordLogin({
      userId: user.id,
      email,
      success: false,
      failureReason: "bad_password",
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    return { ok: false, error: "Invalid email or password", code: "invalid" };
  }

  const remember = Boolean(opts.rememberMe);
  const days = await getAuthSetting(
    remember ? "auth.session_days_remember" : "auth.session_days",
    remember ? 30 : 7,
  );
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const refreshToken = newToken();
  const refreshHash = hashToken(refreshToken);

  const accessToken = await signAccessToken(
    {
      sub: user.id,
      email: user.email,
      name: user.full_name,
    },
    expiresAt,
  );

  await query(
    `INSERT INTO user_sessions (
       user_id, refresh_token_hash, user_agent, ip_address, remember_me, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      user.id,
      refreshHash,
      opts.userAgent ?? null,
      opts.ip ?? null,
      remember,
      expiresAt,
    ],
  );

  await query(
    `UPDATE users
     SET failed_login_count = 0,
         locked_until = NULL,
         last_sign_in_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [user.id],
  );

  await recordLogin({
    userId: user.id,
    email,
    success: true,
    ip: opts.ip,
    userAgent: opts.userAgent,
  });

  await writeActivity({
    actorUserId: user.id,
    eventType: "user.logged_in",
    title: "User logged in",
    meta: { rememberMe: remember },
  });

  await writeAudit({
    userId: user.id,
    module: "auth",
    action: "login",
    ip: opts.ip,
    userAgent: opts.userAgent,
  });

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      emailConfirmedAt: user.email_confirmed_at?.toISOString() ?? null,
      lastSignInAt: new Date().toISOString(),
      isActive: true,
    },
    accessToken,
    refreshToken,
    expiresAt,
  };
}

export async function getSessionUser(
  accessToken: string | undefined | null,
): Promise<AuthUser | null> {
  const claims = await verifyAccessToken(accessToken);
  if (!claims) return null;
  return {
    id: claims.sub,
    email: claims.email,
    fullName: claims.name,
    emailConfirmedAt: null,
    lastSignInAt: null,
    isActive: true,
  };
}

export async function refreshSession(opts: {
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  const refreshHash = hashToken(opts.refreshToken);

  const { rows } = await query<{
    id: string;
    user_id: string;
    remember_me: boolean;
    email: string;
    full_name: string;
  }>(
    `SELECT s.id, s.user_id, s.remember_me, u.email, u.full_name
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.refresh_token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = true`,
    [refreshHash],
  );
  const row = rows[0];
  if (!row) return null;

  const days = await getAuthSetting(
    row.remember_me ? "auth.session_days_remember" : "auth.session_days",
    row.remember_me ? 30 : 7,
  );
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const newRefresh = newToken();

  await query(
    `UPDATE user_sessions
     SET refresh_token_hash = $2,
         expires_at = $3,
         last_seen_at = NOW()
     WHERE id = $1`,
    [row.id, hashToken(newRefresh), expiresAt],
  );

  const accessToken = await signAccessToken(
    { sub: row.user_id, email: row.email, name: row.full_name },
    expiresAt,
  );

  return { accessToken, refreshToken: newRefresh, expiresAt };
}

export async function logoutSession(
  refreshToken: string | null | undefined,
) {
  if (!refreshToken) return;
  await query(
    `UPDATE user_sessions
     SET revoked_at = NOW()
     WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(refreshToken)],
  );
}

export async function logoutAllDevices(userId: string) {
  await query(
    `UPDATE user_sessions SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  await writeAudit({
    userId,
    module: "auth",
    action: "logout_all_devices",
  });
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await loadUserByEmail(email);
  if (!user) return null;
  const raw = newToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashToken(raw), expiresAt],
  );
  return raw;
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<boolean> {
  if (newPassword.length < 8) return false;
  const { rows } = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return false;

  const hash = await hashPassword(newPassword);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE users
       SET encrypted_password = $2, password_changed_at = NOW(),
           failed_login_count = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1`,
      [row.user_id, hash],
    );
    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [row.id],
    );
    await client.query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [row.user_id],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return true;
}

export async function changePassword(opts: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (opts.newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }
  const { rows } = await query<{ id: string; encrypted_password: string | null }>(
    `SELECT id, encrypted_password FROM users WHERE id = $1 AND COALESCE(is_active, true) = true`,
    [opts.userId],
  );
  const user = rows[0];
  if (!user?.encrypted_password) {
    return { ok: false, error: "User not found" };
  }
  const valid = await verifyPassword(opts.currentPassword, user.encrypted_password);
  if (!valid) {
    return { ok: false, error: "Current password is incorrect" };
  }
  const hash = await hashPassword(opts.newPassword);
  await query(
    `UPDATE users
     SET encrypted_password = $2, password_changed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [opts.userId, hash],
  );
  await query(
    `UPDATE user_sessions SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [opts.userId],
  );
  await writeAudit({
    userId: opts.userId,
    module: "auth",
    action: "password_changed",
  });
  return { ok: true };
}

export function toAuthUserShape(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    user_metadata: { full_name: user.fullName },
    app_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: "",
  };
}
