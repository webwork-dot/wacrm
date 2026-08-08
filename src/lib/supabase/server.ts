/**
 * Server createClient — returns DbClient (plain PostgreSQL).
 * Drop-in replacement for former Supabase SSR client.
 */
import { dbAdmin, type DbClient } from "@/lib/db/client";
import { getRequestUser } from "@/lib/auth/session-cookies";

export type { DbClient as SupabaseClient };

export async function createClient(): Promise<DbClient & { auth: AuthShim }> {
  const db = dbAdmin();
  return Object.assign(db, {
    auth: {
      async getUser() {
        const user = await getRequestUser();
        if (!user) return { data: { user: null }, error: { message: "Unauthorized" } };
        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: { full_name: user.fullName },
            },
          },
          error: null,
        };
      },
      async getSession() {
        const user = await getRequestUser();
        if (!user) return { data: { session: null }, error: null };
        return {
          data: {
            session: {
              user: {
                id: user.id,
                email: user.email,
                user_metadata: { full_name: user.fullName },
              },
            },
          },
          error: null,
        };
      },
      async signOut() {
        return { error: null };
      },
    },
  });
}

type AuthShim = {
  getUser: () => Promise<{
    data: { user: { id: string; email: string; user_metadata?: Record<string, unknown> } | null };
    error: { message: string } | null;
  }>;
  getSession: () => Promise<{ data: { session: unknown }; error: null }>;
  signOut: () => Promise<{ error: null }>;
};
