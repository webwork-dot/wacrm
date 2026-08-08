/**
 * Shared PostgreSQL pool — no Supabase.
 */
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const globalForPg = globalThis as unknown as { __convexaPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPg.__convexaPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    globalForPg.__convexaPool = new pg.Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForPg.__convexaPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Run work with app.current_user_id set for RLS-less helpers. */
export async function withUser<T>(
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (userId) {
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
        userId,
      ]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
