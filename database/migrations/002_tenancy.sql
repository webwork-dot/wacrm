-- Tenancy: accounts, profiles, invitations, membership helper

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_role_enum') THEN
    CREATE TYPE public.account_role_enum AS ENUM (
      'owner', 'admin', 'manager', 'agent', 'viewer'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_role_enum') THEN
    CREATE TYPE public.platform_role_enum AS ENUM ('owner', 'admin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  plan_id UUID,
  plan_assigned_at TIMESTAMPTZ,
  plan_notes TEXT,
  logo_url TEXT,
  primary_color TEXT,
  display_name TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_default_currency_format CHECK (default_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_one_per_owner
  ON public.accounts (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_accounts_status ON public.accounts (status);

CREATE TABLE IF NOT EXISTS public.account_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role public.account_role_enum NOT NULL CHECK (role <> 'owner'),
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_invitations_account_pending
  ON public.account_invitations (account_id, expires_at)
  WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  account_role public.account_role_enum NOT NULL,
  beta_features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT profiles_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_account_role
  ON public.profiles (account_id, account_role);

-- Rank: owner=5, admin=4, manager=3, agent=2, viewer=1
CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role public.account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'   THEN 5
            WHEN 'admin'   THEN 4
            WHEN 'manager' THEN 3
            WHEN 'agent'   THEN 2
            WHEN 'viewer'  THEN 1
            ELSE 0
          END
        >=
          CASE min_role
            WHEN 'owner'   THEN 5
            WHEN 'admin'   THEN 4
            WHEN 'manager' THEN 3
            WHEN 'agent'   THEN 2
            WHEN 'viewer'  THEN 1
            ELSE 0
          END
  );
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.accounts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();
