/**
 * Database CLI shared helpers — plain PostgreSQL (no Supabase).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const MIGRATIONS_DIR = path.join(ROOT, "database", "migrations");
export const SEEDS_DIR = path.join(ROOT, "database", "seeds");

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set.\n" +
        "Example: postgresql://postgres:password@127.0.0.1:5432/convexa_dbc",
    );
    process.exit(1);
  }
  return url;
}

export function createPool(connectionString?: string) {
  return new pg.Pool({
    connectionString: connectionString ?? requireDatabaseUrl(),
    max: 5,
  });
}

export function listSqlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") || f.endsWith(".ts") || f.endsWith(".mjs"))
    .sort();
}

export async function ensureMigrationsTable(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function ensureSeedsTable(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_seeds (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export function readSql(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}
