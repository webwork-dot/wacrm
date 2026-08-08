# Authentication (Native)

Convexa uses **native authentication** on plain PostgreSQL. There is no Supabase Auth dependency.

## Model

- Users live in `public.users` (bcrypt password hashes).
- Sessions: `user_sessions` (refresh token hash) + HTTP-only cookies.
- Access JWT: short-lived, signed with `SESSION_SECRET` (`jose`).
- Refresh token: rotated on `/api/auth/refresh`.

## Cookies

| Cookie | Purpose |
|--------|---------|
| Session access cookie | JWT for Edge middleware + API auth |
| Refresh cookie | Opaque token hashed in `user_sessions` |

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/logout` | End session (`scope: "global"` = all devices) |
| POST | `/api/auth/refresh` | Rotate access + refresh |
| POST | `/api/auth/forgot-password` | Create reset token |
| POST | `/api/auth/reset-password` | Apply reset token |
| POST | `/api/auth/change-password` | Authenticated password change |
| POST | `/api/auth/update-email` | Authenticated email change |
| GET | `/api/session/context` | Current user + workspace + permissions |

## Middleware

`src/middleware.ts` verifies the access JWT only (Edge-safe). It must not import `pg`, `bcrypt`, or `native.ts`.

## Provisioning

Self-signup is disabled. Platform owners create clients/users from the console. Seed creates the platform owner via `npm run db:seed` (`SUPER_ADMIN_*` env).

## Security notes

- Passwords: bcrypt (cost 12).
- Lockout: failed login counter + `locked_until`.
- Reset tokens: hashed at rest, single-use, expiry.
- Rate limits on auth mutation routes.
