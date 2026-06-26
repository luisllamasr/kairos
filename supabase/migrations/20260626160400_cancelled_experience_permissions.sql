-- Cancelled experiences: no active leader permissions until revive.
-- UI + RPC alignment — organizer_id is kept in the DB; only planned plans grant leader actions.

CREATE OR REPLACE FUNCTION public.delete_experience(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experiences e
    WHERE e.id = p_id
      AND e.organizer_id = v_me
      AND e.status = 'planned'
  ) THEN
    RAISE EXCEPTION 'not deletable';
  END IF;

  PERFORM public.purge_entity_notifications('experience', p_id);

  DELETE FROM public.experiences
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_experience_leadership(
  p_experience_id     uuid,
  p_new_organizer_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experiences e
    WHERE e.id = p_experience_id
      AND e.organizer_id = v_me
      AND e.status = 'planned'
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, p_new_organizer_id) THEN
    RAISE EXCEPTION 'invalid leader';
  END IF;

  UPDATE public.experiences
  SET organizer_id = p_new_organizer_id
  WHERE id = p_experience_id;

  UPDATE public.experience_participants
  SET role = 'participant'
  WHERE experience_id = p_experience_id;

  UPDATE public.experience_participants
  SET role = 'organizer'
  WHERE experience_id = p_experience_id
    AND user_id = p_new_organizer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_experience_participant(
  p_experience_id uuid,
  p_user_id       uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experiences e
    WHERE e.id = p_experience_id
      AND e.organizer_id = v_me
      AND e.status = 'planned'
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_user_id = v_me THEN
    RAISE EXCEPTION 'use leave';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, p_user_id) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  PERFORM public.enqueue_notification(
    p_user_id,
    'experience_participant_removed',
    'experience',
    p_experience_id,
    v_me,
    '{}'::jsonb
  );

  DELETE FROM public.experience_participants
  WHERE experience_id = p_experience_id AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_experience(
  p_id                uuid,
  p_new_organizer_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me           uuid;
  v_org          uuid;
  v_status       public.experience_status;
  v_other_active integer;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT e.organizer_id, e.status
  INTO v_org, v_status
  FROM public.experiences e
  WHERE e.id = p_id
  FOR UPDATE;

  SELECT COUNT(*) INTO v_other_active
  FROM public.experience_participants ep
  WHERE ep.experience_id = p_id
    AND ep.user_id <> v_me;

  IF v_status = 'planned' AND v_org = v_me AND v_other_active > 0 THEN
    IF p_new_organizer_id IS NULL THEN
      RAISE EXCEPTION 'leader required';
    END IF;
    PERFORM public.transfer_experience_leadership(p_id, p_new_organizer_id);
  END IF;

  PERFORM public.notify_experience_participants(
    p_id,
    'experience_participant_left',
    v_me,
    '{}'::jsonb,
    v_me
  );

  DELETE FROM public.experience_participants
  WHERE experience_id = p_id AND user_id = v_me;

  PERFORM public.purge_experience_if_orphaned(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_experience(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_experience_leadership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_experience_leadership(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_experience_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_experience_participant(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.leave_experience(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_experience(uuid, uuid) TO authenticated;
