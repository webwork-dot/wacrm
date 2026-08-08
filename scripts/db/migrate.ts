#!/usr/bin/env tsx
/**
 * npm run db:migrate — apply pending SQL files in database/migrations/
 */
import path from "node:path";
import {
  createPool,
  ensureMigrationsTable,
  listSqlFiles,
  MIGRATIONS_DIR,
  readSql,
  requireDatabaseUrl,
} from "./lib";

async function main() {
  requireDatabaseUrl();
  const pool = createPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const files = listSqlFiles(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    if (files.length === 0) {
      console.log("No migration files found in database/migrations/");
      return;
    }

    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.id));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }

      const sql = readSql(path.join(MIGRATIONS_DIR, file));
      console.log(`  apply ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (id) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        count += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Migration failed: ${file}`);
        throw err;
      }
    }

    console.log(`\nDone. Applied ${count} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
