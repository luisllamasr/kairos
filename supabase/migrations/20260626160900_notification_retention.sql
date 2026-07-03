-- Notification inbox retention (M14 completion):
-- • Max 50 rows per recipient (trim oldest read first, then oldest unread if needed)
-- • Read notifications older than 30 days are deleted
-- • Unread rows are preserved until cap or entity lifecycle purge
-- Entity-scoped purge helpers (purge_entity_notifications, etc.) are unchanged.

CREATE OR REPLACE FUNCTION public.trim_notification_inbox(
  p_recipient_id uuid,
  p_max_per_user integer DEFAULT 50
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max      integer := GREATEST(COALESCE(p_max_per_user, 50), 1);
  v_overflow integer;
BEGIN
  IF p_recipient_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer - v_max
  INTO v_overflow
  FROM public.notifications n
  WHERE n.recipient_id = p_recipient_id;

  IF v_overflow IS NULL OR v_overflow <= 0 THEN
    RETURN;
  END IF;

  WITH doomed AS (
    SELECT n.id
    FROM public.notifications n
    WHERE n.recipient_id = p_recipient_id
      AND n.read_at IS NOT NULL
    ORDER BY n.created_at ASC, n.id ASC
    LIMIT v_overflow
  )
  DELETE FROM public.notifications n
  USING doomed d
  WHERE n.id = d.id;

  SELECT COUNT(*)::integer - v_max
  INTO v_overflow
  FROM public.notifications n
  WHERE n.recipient_id = p_recipient_id;

  IF v_overflow IS NULL OR v_overflow <= 0 THEN
    RETURN;
  END IF;

  WITH doomed AS (
    SELECT n.id
    FROM public.notifications n
    WHERE n.recipient_id = p_recipient_id
    ORDER BY n.created_at ASC, n.id ASC
    LIMIT v_overflow
  )
  DELETE FROM public.notifications n
  USING doomed d
  WHERE n.id = d.id;
END;
$$;

REVOKE ALL ON FUNCTION public.trim_notification_inbox(uuid, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.maintain_notification_retention(
  p_max_per_user        integer DEFAULT 50,
  p_read_retention_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
  v_batch   integer;
  v_recipient uuid;
  v_max     integer := GREATEST(COALESCE(p_max_per_user, 50), 1);
  v_days    integer := GREATEST(COALESCE(p_read_retention_days, 30), 1);
BEGIN
  DELETE FROM public.notifications n
  WHERE n.read_at IS NOT NULL
    AND n.read_at < NOW() - make_interval(days => v_days);

  GET DIAGNOSTICS v_batch = ROW_COUNT;
  v_deleted := v_deleted + v_batch;

  FOR v_recipient IN
    SELECT DISTINCT n.recipient_id
    FROM public.notifications n
  LOOP
    PERFORM public.trim_notification_inbox(v_recipient, v_max);
  END LOOP;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_notification_retention(integer, integer) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.maintain_stale_notifications(integer);

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_recipient_id uuid,
  p_type         text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_actor_id     uuid DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient_id IS NULL THEN
    RETURN;
  END IF;

  IF p_actor_id IS NOT NULL AND p_recipient_id = p_actor_id THEN
    RETURN;
  END IF;

  IF p_entity_type = 'experience' AND p_entity_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.experience_participants ep
      WHERE ep.experience_id = p_entity_id
        AND ep.user_id = p_recipient_id
        AND ep.notifications_muted
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF p_entity_type = 'memory' AND p_entity_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.memory_participants mp
      WHERE mp.memory_id = p_entity_id
        AND mp.user_id = p_recipient_id
        AND mp.left_at IS NULL
        AND mp.notifications_muted
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    type,
    entity_type,
    entity_id,
    actor_id,
    payload
  )
  VALUES (
    p_recipient_id,
    p_type,
    p_entity_type,
    p_entity_id,
    p_actor_id,
    COALESCE(p_payload, '{}'::jsonb)
  );

  PERFORM public.trim_notification_inbox(p_recipient_id, 50);
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, uuid, uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.maintain_orphaned_memories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_orphaned_memory_rows();
  PERFORM public.maintain_notification_retention();
  RETURN public.purge_orphaned_memories();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.maintain_orphaned_memories() FROM PUBLIC;
