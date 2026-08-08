/**
 * Production install verification — run on a machine with DATABASE_URL set.
 *
 *   npx tsx scripts/db/verify-install.ts
 *
 * Checks migrate artifacts, seed owner, and critical tables/functions.
 * Does not require WhatsApp credentials.
 */
import { query, getPool } from "../../src/lib/db/pool";

async function must(label: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn();
    console.log(ok ? `✓ ${label}` : `✗ ${label}`);
    return ok;
  } catch (err) {
    console.log(`✗ ${label}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.warn("! SESSION_SECRET missing or short (<32) — required for production");
  }

  let failed = 0;

  if (
    !(await must("schema_migrations has rows", async () => {
      const { rows } = await query<{ c: string }>(
        `SELECT count(*)::text AS c FROM schema_migrations`,
      );
      return Number(rows[0]?.c ?? 0) >= 10;
    }))
  )
    failed++;

  if (
    !(await must("users table exists", async () => {
      const { rows } = await query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'users'`,
      );
      return rows.length > 0;
    }))
  )
    failed++;

  if (
    !(await must("platform owner seeded", async () => {
      const { rows } = await query(
        `SELECT 1 FROM platform_users WHERE platform_role = 'owner' LIMIT 1`,
      );
      return rows.length > 0;
    }))
  )
    failed++;

  if (
    !(await must("no accounts before client provision", async () => {
      const { rows } = await query<{ c: string }>(
        `SELECT count(*)::text AS c FROM accounts`,
      );
      // Fresh install expectation; warn-only if >0
      const n = Number(rows[0]?.c ?? 0);
      if (n > 0) console.log(`  (note: ${n} accounts already exist)`);
      return true;
    }))
  )
    failed++;

  if (
    !(await must("claim_ai_reply_slot exists", async () => {
      const { rows } = await query(
        `SELECT 1 FROM pg_proc WHERE proname = 'claim_ai_reply_slot'`,
      );
      return rows.length > 0;
    }))
  )
    failed++;

  if (
    !(await must("match_ai_knowledge_fts exists", async () => {
      const { rows } = await query(
        `SELECT 1 FROM pg_proc WHERE proname = 'match_ai_knowledge_fts'`,
      );
      return rows.length > 0;
    }))
  )
    failed++;

  if (
    !(await must("filter_contacts_by_tags exists (after 011)", async () => {
      const { rows } = await query(
        `SELECT 1 FROM pg_proc WHERE proname = 'filter_contacts_by_tags'`,
      );
      return rows.length > 0;
    }))
  )
    failed++;

  await getPool().end();
  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nInstall verification passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
