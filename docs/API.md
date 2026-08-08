# API conventions

## Public API (`/api/v1/*`)

Use helpers in `src/lib/api/v1/respond.ts` and `pagination.ts`:

- Success object: `ok(data)`
- Success list: `okList(items, nextCursor)`
- Errors: `unauthorized` / `forbidden` / `badRequest` / `rateLimited` → `toApiErrorResponse`
- Auth: scoped API keys (`Authorization: Bearer …`)
- Pagination: cursor-based (`limit` + `cursor`)

See [public-api.md](./public-api.md).

## Dashboard / session APIs (`/api/*` except `/api/v1`)

- Auth: native session cookies + `getRequestUser()` / `getCurrentAccount()` / `requireRole()`
- Errors: `{ error: string }` JSON with HTTP status via `toErrorResponse` (`src/lib/auth/account.ts`)
- Rate limits: `checkRateLimit` + `rateLimitResponse` (`src/lib/rate-limit.ts`)
- Mutations that need admin visibility: `dbAdmin()` / `supabaseAdmin()` alias (plain `pg`, not Supabase)

## Auth routes (`/api/auth/*`)

Documented in [AUTHENTICATION.md](./AUTHENTICATION.md). Exempt from Edge middleware session gate (matcher excludes `/api/auth/`).

## WhatsApp webhook

`POST /api/whatsapp/webhook` is public (signature-verified). Other `/api/whatsapp/*` routes require a session (middleware returns 401).

## Browser data proxy

`POST/PUT /api/db/proxy` — authenticated table whitelist for client-side `.from()` shims. Prefer dedicated route handlers for new features; do not expand the whitelist casually.

## File uploads

- `POST /api/files/upload` — multipart, MIME allow-list, 15MB cap
- `GET /api/files/raw?path=` — authenticated read from `storage/uploads`
