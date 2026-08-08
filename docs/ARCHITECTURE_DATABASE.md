# Convexa Database Architecture

Self-hosted SaaS on plain PostgreSQL. Application authentication and data access no longer depend on Supabase Cloud.

## Authentication

```
Browser → POST /api/auth/login
       → bcrypt verify public.users
       → access JWT cookie (SESSION_SECRET) + opaque refresh in user_sessions
Edge middleware → verify JWT only (no DB)
Server routes → getRequestUser() / getCurrentAccount()
```

Features:

- Remember me (longer session TTL via `platform_settings`)
- Failed login tracking + configurable lockout
- Login history
- Password reset tokens
- Logout current / logout all devices
- Multi-session support

## Data access

`src/lib/db/pool.ts` — `pg` Pool (`DATABASE_URL`)  
`src/lib/db/client.ts` — chainable `.from().select().eq()` helper used as drop-in for former `supabaseAdmin()`

App helpers set `app.current_user_id` when needed (`current_app_user_id()`).

## Queue

- **`jobs`** — generic async work (broadcast, AI, imports, webhooks, notifications…)
- **`automation_job_queue`** — unchanged specialized flow/automation runner (compatibility)
- **`scheduled_jobs`** — cron / delayed metadata

## Files

Modules store `file_id` references. Drivers: `local`, `minio`, `s3`, `r2` via `storage_providers`.

## Audit vs activity

| | Audit (`audit_logs`) | Activity (`activity_logs`) |
|--|----------------------|----------------------------|
| Audience | Security / compliance | Product UI feed |
| Mutable | Never | Soft retention OK |
| Content | old/new JSON, IP, UA | Human titles |

## Connections

External systems (WhatsApp, LLM, …) go through `connections` with provider, health, latency, reconnect_count, expiry.

## AI / pgvector

If `vector` extension is missing:

- Migrations still succeed
- Lexical FTS search works
- Semantic search reports “Vector extension not installed”
- `embedding_status` tracks PENDING / PROCESSING / READY / FAILED

## Health

`GET /api/platform/health` writes `system_health` rows for database, queue, storage, AI vector.

`npm run db:verify` fails the install if required tables or Platform Owner are missing.

## Install path

See [INSTALL_SELF_HOSTED.md](./INSTALL_SELF_HOSTED.md):

```
createdb → npm install → db:migrate → db:seed → db:verify → build → start
```

No SQL dump. No Supabase Cloud. No Supabase Auth/Storage/Realtime.
