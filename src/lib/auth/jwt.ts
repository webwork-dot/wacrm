/**
 * Edge-safe session JWT (access token cookie).
 * Refresh token remains opaque and DB-backed.
 */
import { SignJWT, jwtVerify } from "jose";

export type SessionClaims = {
  sub: string;
  email: string;
  name: string;
};

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET must be set to a random string of at least 32 characters",
      );
    }
    return new TextEncoder().encode(
      "dev-only-change-me-session-secret-32b",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Short-lived access JWT TTL (seconds). Refresh cookie holds the long session. */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;

export async function signAccessToken(
  claims: SessionClaims,
  _sessionExpiresAt?: Date,
): Promise<string> {
  return new SignJWT({
    email: claims.email,
    name: claims.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}
