#!/usr/bin/env tsx
/**
 * npm run db:fresh — DROP SCHEMA public CASCADE, migrate, seed.
 * Destructive. Intended for local / empty VPS bootstrap only.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, requireDatabaseUrl } from "./lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = requireDatabaseUrl();
  if (!process.env.DB_FRESH_CONFIRM && process.env.NODE_ENV === "production") {
    console.error(
      "Refusing db:fresh in production without DB_FRESH_CONFIRM=1",
    );
    process.exit(1);
  }

  console.log("Dropping and recreating public schema…");
  const pool = createPool(url);
  const client = await pool.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO PUBLIC");
  } finally {
    client.release();
    await pool.end();
  }

  const run = (script: string) => {
    const r = spawnSync("npx", ["tsx", path.join(__dirname, script)], {
      stdio: "inherit",
      env: process.env,
      shell: true,
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  };

  console.log("\nRunning migrations…");
  run("migrate.ts");
  console.log("\nRunning seeds…");
  run("seed.ts");
  console.log("\nDatabase is fresh and ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
