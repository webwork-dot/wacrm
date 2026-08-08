/**
 * 002_super_admin.ts — Platform Owner only.
 *
 * Creates:
 *   - public.users (bcrypt password hash)
 *   - platform_users (role = owner)
 *
 * No client account / company / contacts.
 *
 * Env overrides:
 *   SUPER_ADMIN_EMAIL    (default admin@convexa.co.in)
 *   SUPER_ADMIN_PASSWORD (default ChangeMe123!)
 *   SUPER_ADMIN_NAME     (default Platform Owner)
 */
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";

export default async function seed(client: PoolClient) {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? "admin@convexa.co.in")
    .trim()
    .toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";
  const fullName = process.env.SUPER_ADMIN_NAME ?? "Platform Owner";

  if (password.length < 8) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters");
  }

  const hash = await bcrypt.hash(password, 12);

  const existing = await client.query(
    `SELECT id FROM public.users WHERE lower(email) = $1`,
    [email],
  );

  let userId: string;
  if (existing.rowCount && existing.rows[0]) {
    userId = existing.rows[0].id as string;
    await client.query(
      `UPDATE public.users
       SET encrypted_password = $2,
           full_name = $3,
           email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
           is_active = true,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, hash, fullName],
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO public.users (
         email, encrypted_password, full_name, email_confirmed_at, is_active
       ) VALUES ($1, $2, $3, NOW(), true)
       RETURNING id`,
      [email, hash, fullName],
    );
    userId = inserted.rows[0].id as string;
  }

  await client.query(
    `INSERT INTO public.platform_users (user_id, platform_role, status, created_at)
     VALUES ($1, 'owner', 'active', NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET platform_role = 'owner',
           status = 'active'`,
    [userId],
  );

  console.log(`  → Platform Owner ready: ${email}`);
  console.log(`  → Change password after first login.`);
}
