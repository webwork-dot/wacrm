# Convexa database (plain PostgreSQL)

Provider-independent schema. No Supabase Cloud schemas (`auth`, `storage`, `realtime`, `vault`).

## Commands

```bash
# Apply pending migrations
npm run db:migrate

# Apply pending seeds (platform catalog + Platform Owner)
npm run db:seed

# Drop public schema → migrate → seed (dev only)
DB_FRESH_CONFIRM=1 npm run db:fresh
```

Requires `DATABASE_URL` in `.env`:

```
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/convexa_dbc
```

## Layout

| Path | Purpose |
|------|---------|
| `migrations/*.sql` | Business tables, indexes, helpers |
| `seeds/001_initial_seed.sql` | Permissions, roles, flags, plans, settings |
| `seeds/002_super_admin.ts` | One Platform Owner (bcrypt hash) |

## Session helper

App code that previously used `auth.uid()` should set:

```sql
SELECT set_config('app.current_user_id', '<user-uuid>', true);
```

Then `current_app_user_id()` / `is_account_member(...)` work on plain PostgreSQL.
