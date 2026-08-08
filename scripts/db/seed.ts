#!/usr/bin/env tsx
/**
 * npm run db:seed — apply pending seed files in database/seeds/
 * Supports .sql and .ts (default export async function(client))
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPool,
  ensureSeedsTable,
  listSqlFiles,
  readSql,
  requireDatabaseUrl,
  SEEDS_DIR,
} from "./lib";

async function main() {
  requireDatabaseUrl();
  const pool = createPool();
  const client = await pool.connect();

  try {
    await ensureSeedsTable(client);
    const files = listSqlFiles(SEEDS_DIR);
    if (files.length === 0) {
      console.log("No seed files found in database/seeds/");
      return;
    }

    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM schema_seeds",
    );
    const applied = new Set(rows.map((r) => r.id));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }

      console.log(`  seed  ${file}`);
      await client.query("BEGIN");
      try {
        if (file.endsWith(".sql")) {
          await client.query(readSql(path.join(SEEDS_DIR, file)));
        } else if (file.endsWith(".ts") || file.endsWith(".mjs")) {
          const mod = await import(
            pathToFileURL(path.join(SEEDS_DIR, file)).href
          );
          const fn = mod.default ?? mod.seed;
          if (typeof fn !== "function") {
            throw new Error(`${file} must export default async function(client)`);
          }
          await fn(client);
        }
        await client.query("INSERT INTO schema_seeds (id) VALUES ($1)", [file]);
        await client.query("COMMIT");
        count += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Seed failed: ${file}`);
        throw err;
      }
    }

    console.log(`\nDone. Applied ${count} seed(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
