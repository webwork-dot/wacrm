-- 011_production_hardening.sql
-- Additive only: message status stamps, contact tag filter RPC.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.tg_messages_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_set_updated_at ON public.messages;
CREATE TRIGGER messages_set_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.tg_messages_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_messages_updated
  ON public.messages (updated_at DESC);

-- Server-side tag filter (ported from legacy supabase migration 025).
CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_mode TEXT DEFAULT 'any',
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (contact_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account UUID;
  v_mode TEXT := lower(coalesce(p_mode, 'any'));
BEGIN
  BEGIN
    v_account := NULLIF(current_setting('app.current_account_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_account := NULL;
  END;

  IF v_account IS NULL THEN
    SELECT p.account_id INTO v_account
    FROM profiles p
    WHERE p.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    LIMIT 1;
  END IF;

  IF v_account IS NULL OR p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_mode = 'all' THEN
    RETURN QUERY
    SELECT ct.contact_id
    FROM contact_tags ct
    INNER JOIN contacts c ON c.id = ct.contact_id
    WHERE c.account_id = v_account
      AND ct.tag_id = ANY (p_tag_ids)
    GROUP BY ct.contact_id
    HAVING count(DISTINCT ct.tag_id) = array_length(p_tag_ids, 1)
    ORDER BY ct.contact_id
    LIMIT GREATEST(1, LEAST(coalesce(p_limit, 500), 2000))
    OFFSET GREATEST(0, coalesce(p_offset, 0));
  ELSE
    RETURN QUERY
    SELECT DISTINCT ct.contact_id
    FROM contact_tags ct
    INNER JOIN contacts c ON c.id = ct.contact_id
    WHERE c.account_id = v_account
      AND ct.tag_id = ANY (p_tag_ids)
    ORDER BY ct.contact_id
    LIMIT GREATEST(1, LEAST(coalesce(p_limit, 500), 2000))
    OFFSET GREATEST(0, coalesce(p_offset, 0));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) TO PUBLIC;
