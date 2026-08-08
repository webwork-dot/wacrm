#!/usr/bin/env tsx
/**
 * npm run db:verify — installation health checks after migrate + seed.
 * Exits non-zero if any critical check fails.
 */
import {
  createPool,
  requireDatabaseUrl,
} from "./lib";

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  requireDatabaseUrl();
  const pool = createPool();
  const checks: Check[] = [];

  try {
    await pool.query("SELECT 1");
    checks.push({ name: "database_connection", ok: true });
  } catch (e) {
    checks.push({
      name: "database_connection",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
    print(checks);
    process.exit(1);
  }

  const requiredTables = [
    "users",
    "accounts",
    "profiles",
    "platform_users",
    "permissions",
    "role_permissions",
    "feature_flags",
    "user_sessions",
    "login_history",
    "files",
    "audit_logs",
    "activity_logs",
    "jobs",
    "scheduled_jobs",
    "workspace_branding",
    "client_onboarding",
    "system_health",
    "contacts",
    "conversations",
    "messages",
  ];

  for (const table of requiredTables) {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [table],
    );
    checks.push({
      name: `table:${table}`,
      ok: rows[0]?.exists === true,
      detail: rows[0]?.exists ? undefined : "missing",
    });
  }

  const { rows: owners } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM platform_users WHERE platform_role = 'owner'`,
  );
  checks.push({
    name: "platform_owner_seeded",
    ok: Number(owners[0]?.c ?? 0) >= 1,
    detail: `count=${owners[0]?.c ?? 0}`,
  });

  const { rows: clients } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM accounts a
     WHERE a.owner_user_id NOT IN (SELECT user_id FROM platform_users)`,
  );
  checks.push({
    name: "client_list_empty",
    ok: Number(clients[0]?.c ?? 0) === 0,
    detail: `count=${clients[0]?.c ?? 0}`,
  });

  const { rows: perms } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM permissions`,
  );
  checks.push({
    name: "permissions_seeded",
    ok: Number(perms[0]?.c ?? 0) >= 10,
    detail: `count=${perms[0]?.c ?? 0}`,
  });

  // Optional vector
  const { rows: vec } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists`,
  );
  checks.push({
    name: "pgvector_optional",
    ok: true,
    detail: vec[0]?.exists
      ? "installed"
      : "not installed (semantic search disabled)",
  });

  // No supabase schemas required
  for (const schema of ["auth", "storage", "realtime", "vault"]) {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS exists`,
      [schema],
    );
    checks.push({
      name: `no_supabase_schema:${schema}`,
      ok: true,
      detail: rows[0]?.exists
        ? "present (ignored — not required)"
        : "absent (good)",
    });
  }

  print(checks);
  await pool.end();

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`\nFAILED ${failed.length} check(s).`);
    process.exit(1);
  }
  console.log("\nAll critical checks passed.");
}

function print(checks: Check[]) {
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    console.log(`${mark} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
