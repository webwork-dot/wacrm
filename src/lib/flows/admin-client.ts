import { dbAdmin, type DbClient } from "@/lib/db/client";

/** Service-role style DB access — plain PostgreSQL (no Supabase). */
export function supabaseAdmin(): DbClient {
  return dbAdmin();
}
