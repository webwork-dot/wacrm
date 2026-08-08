-- Business triggers & engine helpers (no auth.users signup hooks)

-- Profile privilege columns: block direct changes from app sessions.
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.account_role IS DISTINCT FROM OLD.account_role
      OR NEW.account_id IS DISTINCT FROM OLD.account_id)
     AND nullif(current_setting('app.current_user_id', true), '') IS NOT NULL
  THEN
    RAISE EXCEPTION
      'account_role and account_id cannot be changed directly; use the account member/invitation RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_privilege_columns ON public.profiles;
CREATE TRIGGER enforce_profile_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_profile_privilege_columns();

-- Broadcast recipient aggregate counts (incremental).
CREATE OR REPLACE FUNCTION public._bcast_bump(bid UUID, col TEXT, delta INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE format(
    'UPDATE broadcasts SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE id = $2',
    col, col
  ) USING delta, bid;
END;
$$;

CREATE OR REPLACE FUNCTION public._bcast_cols_for_status(s TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF s = 'pending' THEN RETURN ARRAY[]::TEXT[]; END IF;
  IF s = 'sent'      THEN RETURN ARRAY['sent_count']; END IF;
  IF s = 'delivered' THEN RETURN ARRAY['sent_count', 'delivered_count']; END IF;
  IF s = 'read'      THEN RETURN ARRAY['sent_count', 'delivered_count', 'read_count']; END IF;
  IF s = 'replied'   THEN RETURN ARRAY['sent_count', 'delivered_count', 'read_count', 'replied_count']; END IF;
  IF s = 'failed'    THEN RETURN ARRAY['failed_count']; END IF;
  RETURN ARRAY[]::TEXT[];
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE broadcasts b SET
    sent_count      = agg.sent_count,
    delivered_count = agg.delivered_count,
    read_count      = agg.read_count,
    replied_count   = agg.replied_count,
    failed_count    = agg.failed_count,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read', 'replied')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered', 'read', 'replied')) AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('read', 'replied')) AS read_count,
      COUNT(*) FILTER (WHERE status = 'replied') AS replied_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
    FROM broadcast_recipients
    WHERE broadcast_id = bid
  ) agg
  WHERE b.id = bid;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_recipient_aggregate_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_cols TEXT[];
  new_cols TEXT[];
  c TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_cols := _bcast_cols_for_status(NEW.status);
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(OLD.broadcast_id, c, -1);
    END LOOP;
    RETURN OLD;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    new_cols := _bcast_cols_for_status(NEW.status);
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, -1);
    END LOOP;
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_recipients_aggregate ON public.broadcast_recipients;
CREATE TRIGGER broadcast_recipients_aggregate
  AFTER INSERT OR UPDATE OR DELETE ON public.broadcast_recipients
  FOR EACH ROW
  EXECUTE PROCEDURE public.broadcast_recipient_aggregate_trigger();

-- Conversation assignment notifications.
CREATE OR REPLACE FUNCTION public.notify_conversation_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
  v_caller UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NULL
       OR NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  v_caller := nullif(current_setting('app.current_user_id', true), '')::uuid;
  IF v_caller IS NOT NULL AND v_caller = NEW.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  IF v_caller IS NOT NULL THEN
    SELECT full_name INTO v_actor_name
    FROM profiles WHERE user_id = v_caller;
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, conversation_id, contact_id,
    actor_user_id, title, body
  ) VALUES (
    NEW.account_id,
    NEW.assigned_agent_id,
    'conversation_assigned',
    NEW.id,
    NEW.contact_id,
    v_caller,
    'New conversation assigned',
    COALESCE(v_actor_name, 'Someone') || ' assigned you a conversation with '
      || COALESCE(v_contact_name, 'a contact')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create assignment notification for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_conversation_assigned ON public.conversations;
CREATE TRIGGER on_conversation_assigned
  AFTER INSERT OR UPDATE OF assigned_agent_id ON public.conversations
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_conversation_assigned();

-- Atomic execution counters for automations & flows.
CREATE OR REPLACE FUNCTION public.increment_automation_execution_count(p_automation_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE automations
  SET execution_count = execution_count + 1,
      last_executed_at = NOW()
  WHERE id = p_automation_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_flow_execution_count(p_flow_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE flows
  SET execution_count = execution_count + 1,
      last_executed_at = NOW()
  WHERE id = p_flow_id;
$$;

-- Intentionally no trigger on auth.users / public.users for auto profile creation.
-- Application code owns signup bootstrap (account + profile).
