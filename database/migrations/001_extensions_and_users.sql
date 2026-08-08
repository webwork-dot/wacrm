-- Convexa plain PostgreSQL — extensions, users, session helpers
-- Idempotent where practical.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Session user id set by the application (replaces auth.uid()).
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  encrypted_password TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

DROP TRIGGER IF EXISTS set_updated_at ON public.users;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();
