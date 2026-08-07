-- ============================================================
-- 045_experience_shell.sql — Add `manager` to account_role_enum
--
-- Must run (and commit) BEFORE 046. Postgres forbids using a new
-- enum label in the same transaction that added it (55P04).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'account_role_enum' AND e.enumlabel = 'manager'
  ) THEN
    ALTER TYPE account_role_enum ADD VALUE 'manager' AFTER 'admin';
  END IF;
END $$;
