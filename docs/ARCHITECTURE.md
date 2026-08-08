# Architecture Overview

Convexa is a self-hosted WhatsApp CRM: **Next.js (App Router) + plain PostgreSQL + native auth**.

## Locked foundations

Do not redesign these without an explicit platform decision:

- Database schema under `database/migrations/`
- Multi-tenant `accounts` + membership model
- Permission / role system
- Native auth (JWT + refresh cookies)
- Migration runner (`npm run db:migrate`)

## Runtime layout

```
Browser UI
  → Next.js App Router (RSC + client components)
  → /api/* route handlers
  → pg Pool (DATABASE_URL)
  → PostgreSQL

Workers / cron
  → /api/*/cron (shared secrets)
  → same pg pool / DbClient
```

## Data access

| Layer | Module | Notes |
|-------|--------|-------|
| Server admin | `src/lib/db/client.ts` (`dbAdmin`) | PostgREST-style `.from()` over `pg` |
| Server session | `src/lib/supabase/server.ts` | Compatibility name; returns DbClient + auth shim |
| Browser | `src/lib/supabase/client.ts` | `/api/db/proxy` + polling channels + `/api/files` |
| SQL | `src/lib/db/pool.ts` | Raw `query()` / transactions |

There is **zero** runtime dependency on `@supabase/*`.

## Domains

- **Inbox** — conversations, messages, presence (polling), media via local storage API
- **Contacts / pipelines / broadcasts** — account-scoped CRM tables
- **Automations / Flows** — graph engines + job queues in Postgres
- **AI** — providers (OpenAI / Anthropic / Gemini), knowledge chunks, embeddings (optional pgvector)
- **Platform console** — multi-client admin for platform owners

## Related docs

- [INSTALL_SELF_HOSTED.md](./INSTALL_SELF_HOSTED.md)
- [DATABASE.md](./DATABASE.md)
- [ARCHITECTURE_DATABASE.md](./ARCHITECTURE_DATABASE.md)
- [AUTHENTICATION.md](./AUTHENTICATION.md)
- [public-api.md](./public-api.md)
