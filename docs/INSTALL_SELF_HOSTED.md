# Convexa — Self-Hosted Installation (Plain PostgreSQL)

This guide installs Convexa on a VPS with **standard PostgreSQL only**.

No Supabase Cloud. No SQL dump. Schema comes from `database/migrations/` + `database/seeds/`.

**Requirements**

- Ubuntu 22.04+ (or similar)
- Node.js 20+
- PostgreSQL 15+ (15 required for `NULLS NOT DISTINCT` indexes)
- Nginx + Certbot (production)
- Optional: `postgresql-15-pgvector` for AI semantic search

---

## 1. System packages

```bash
sudo apt update
sudo apt install -y curl git build-essential nginx certbot python3-certbot-nginx

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL 15
sudo apt install -y postgresql postgresql-contrib

# Optional — AI embeddings
sudo apt install -y postgresql-15-pgvector || true
```

---

## 2. Create database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER convexa WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE convexa_dbc OWNER convexa;
GRANT ALL PRIVILEGES ON DATABASE convexa_dbc TO convexa;
\c convexa_dbc
GRANT ALL ON SCHEMA public TO convexa;
ALTER DATABASE convexa_dbc OWNER TO convexa;
SQL
```

Connection string:

```
postgresql://convexa:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/convexa_dbc
```

---

## 3. Application code

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone <YOUR_REPO_URL> convexa
sudo chown -R $USER:$USER /var/www/convexa
cd /var/www/convexa
npm ci
```

---

## 4. Environment

Create `/var/www/convexa/.env`:

```env
# Plain PostgreSQL (migrations + app data)
DATABASE_URL=postgresql://convexa:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/convexa_dbc

# Session JWT signing (use a long random string in production)
SESSION_SECRET=generate_with_openssl_rand_hex_32

# App
NEXT_PUBLIC_SITE_URL=https://app.convexa.co.in
NEXT_PUBLIC_APP_LOCALE=en

# AES-256-GCM key — 64 hex chars
ENCRYPTION_KEY=generate_with_openssl_rand_hex_32

# Meta (optional until WhatsApp is connected)
META_APP_SECRET=

# Cron / automation
AUTOMATION_CRON_SECRET=generate_long_random_string

# Platform owner bootstrap (used by db:seed)
SUPER_ADMIN_EMAIL=admin@convexa.co.in
SUPER_ADMIN_PASSWORD=ChangeMe123!
SUPER_ADMIN_NAME=Platform Owner
PLATFORM_ADMIN_EMAILS=admin@convexa.co.in
```

Generate secrets:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 32   # AUTOMATION_CRON_SECRET
openssl rand -hex 32   # SESSION_SECRET
```

---

## 5. Migrate + seed

```bash
cd /var/www/convexa

npm run db:migrate
npm run db:seed
npm run db:verify
```

Expected:

- All tables created under `public`
- Permissions, roles, feature flags, plans seeded
- Platform Owner created (`SUPER_ADMIN_EMAIL`)
- **No client companies / contacts / messages**

Development reset:

```bash
# Drops public schema — never run on production data
DB_FRESH_CONFIRM=1 npm run db:fresh
```

---

## 6. Verify database

```bash
psql "$DATABASE_URL" -c "\dt"
psql "$DATABASE_URL" -c "SELECT email FROM users;"
psql "$DATABASE_URL" -c "SELECT platform_role FROM platform_users;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM accounts;"   # expect 0
```

---

## 7. Build & start (PM2)

```bash
npm run build

sudo npm i -g pm2
pm2 start npm --name convexa -- start
pm2 save
pm2 startup
```

App listens on `http://127.0.0.1:3000` by default.

---

## 8. Nginx + HTTPS

`/etc/nginx/sites-available/convexa`:

```nginx
server {
  server_name app.convexa.co.in;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/convexa /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.convexa.co.in
```

---

## 9. First login

1. Open `https://app.convexa.co.in/login`
2. Sign in with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
3. Change password immediately
4. Client list should be empty — provision clients from Platform Console

Native auth uses `public.users` + bcrypt + JWT cookies (`SESSION_SECRET`). No Supabase Auth.

---

## 10. Optional pgvector

If the extension is missing, migrations still succeed. Semantic AI search shows a soft “Vector extension not installed” path instead of crashing. Lexical (FTS) knowledge search continues to work.

```bash
sudo apt install -y postgresql-15-pgvector
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
# Re-run migrate if embedding column was skipped earlier, or add column manually per 007_ai_knowledge.sql
```

---

## 11. Folder map

```
database/
  migrations/     # Ordered SQL — business schema only
  seeds/
    001_initial_seed.sql
    002_super_admin.ts   # bcrypt Platform Owner
scripts/db/
  migrate.ts
  seed.ts
  fresh.ts
```

Legacy `supabase/migrations/` are retained for reference only and are **not** used by `npm run db:*`.

---

## Acceptance checklist

- [ ] `createdb` / `CREATE DATABASE convexa_dbc`
- [ ] `npm run db:migrate` — no errors
- [ ] `npm run db:seed` — Platform Owner created
- [ ] `SELECT count(*) FROM accounts` = 0
- [ ] No `auth` / `storage` / `realtime` schemas required
- [ ] App boots with `DATABASE_URL`
- [ ] Platform Owner can reach console after login
- [ ] Zero `@supabase/*` packages in `package.json` / `node_modules`

## More docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [AUTHENTICATION.md](./AUTHENTICATION.md)
- [API.md](./API.md)
- [AI.md](./AI.md)
- [CONNECTIONS.md](./CONNECTIONS.md)
- [WORKERS.md](./WORKERS.md)
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- [DATABASE.md](./DATABASE.md)

After migrate + seed:

```bash
npm run db:verify-install
```
