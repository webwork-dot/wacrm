# Troubleshooting

## Install / migrate

| Symptom | Fix |
|---------|-----|
| `DATABASE_URL is not set` | Create `.env` from `.env.example` |
| Migration fails on `NULLS NOT DISTINCT` | Use PostgreSQL **15+** |
| `vector` extension errors | Optional — install `postgresql-15-pgvector` or ignore; FTS still works |
| Seed creates no clients | Expected — catalogs + Platform Owner only |

## Auth

| Symptom | Fix |
|---------|-----|
| Redirect loop on `/login` | Ensure `SESSION_SECRET` is set and stable across restarts |
| Login succeeds then immediately logged out | Cookies require HTTPS in production (`Secure`); check reverse proxy |
| “Accounts are provisioned” on signup | Self-signup is disabled — use Platform Console |
| Password change fails | Use Settings → Profile; calls `/api/auth/change-password` |

## App / inbox

| Symptom | Fix |
|---------|-----|
| Inbox updates slowly | Realtime is polling (~4s) via `/api/db/proxy` — not Supabase Realtime |
| Media upload fails | Ensure `storage/uploads` is writable; check `/api/files/upload` |
| WhatsApp webhook 401 | Webhook path is public; other `/api/whatsapp/*` require session |

## Build

| Symptom | Fix |
|---------|-----|
| CI / build missing env | Set `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` |
| Residual Supabase mentions in `supabase/` | Reference-only legacy migrations — not used by `npm run db:*` |

## Verify zero Supabase runtime

```bash
npm ls @supabase/supabase-js @supabase/ssr
# expect: (empty)
```
