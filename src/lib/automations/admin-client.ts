import { dbAdmin, type DbClient } from "@/lib/db/client";

export function supabaseAdmin(): DbClient {
  return dbAdmin();
}
