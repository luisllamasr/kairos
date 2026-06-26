-- Migration: shared experiences lifecycle (milestone 14 — phase 3)
--
-- Edit policy, cancel/delete/revive, multi-participant transform.

DROP FUNCTION IF EXISTS public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision);

-- -----------------------------------------------------------------------------
-- 1. update_experience — edit policy + participant access
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_experience(
  p_id                   uuid,
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_starts_at            timestamptz,
  p_ends_at              timestamptz,
  p_location_latitude    double precision DEFAULT NULL,
  p_location_longitude   double precision DEFAULT NULL,
  p_expected_updated_at  timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid;
  v_title text;
  v_exp   public.experiences%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT * INTO v_exp FROM public.experiences e WHERE e.id = p_id FOR UPDATE;

  IF v_exp.status <> 'planned' OR v_exp.transform_at <= NOW() THEN
    RAISE EXCEPTION 'not updatable';
  END IF;

  IF v_exp.edit_info_policy = 'leader_only' AND v_exp.organizer_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_exp.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'conflict';
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'dates required';
  END IF;

  IF p_starts_at < public.experience_min_starts_at() THEN
    RAISE EXCEPTION 'starts in past';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid dates';
  END IF;

  v_title := trim(p_title);
  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'invalid title';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 2000 THEN
    RAISE EXCEPTION 'invalid description';
  END IF;

  IF p_location_name IS NOT NULL AND char_length(trim(p_location_name)) > 200 THEN
    RAISE EXCEPTION 'invalid location name';
  END IF;

  IF (p_location_latitude IS NULL) <> (p_location_longitude IS NULL) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  IF p_location_latitude IS NOT NULL AND (
    p_location_latitude < -90 OR p_location_latitude > 90
    OR p_location_longitude < -180 OR p_location_longitude > 180
  ) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  UPDATE public.experiences
  SET
    title = v_title,
    description = NULLIF(trim(p_description), ''),
    location_name = NULLIF(trim(p_location_name), ''),
    location_latitude = p_location_latitude,
    location_longitude = p_location_longitude,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    transform_at = public.compute_experience_transform_at(p_ends_at),
    visibility = 'private'
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, timestamptz) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. cancel / delete / revive
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_experience(p_id uuid)
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

  UPDATE public.experiences
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    purge_at = public.compute_experience_cancel_purge_at(ends_at)
  WHERE id = p_id
    AND organizer_id = v_me
    AND status = 'planned';

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.experiences e
      WHERE e.id = p_id AND e.organizer_id = v_me AND e.status = 'cancelled'
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'not cancellable';
  END IF;

  PERFORM public.cancel_experience_pending_invites(p_id);
END;
$$;

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

  DELETE FROM public.experiences
  WHERE id = p_id
    AND organizer_id = v_me
    AND (
      status = 'planned'
      OR (status = 'cancelled' AND purge_at IS NOT NULL AND purge_at > NOW())
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not deletable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revive_experience(p_id uuid)
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

  IF NOT public.is_experience_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.experiences
  SET
    status = 'planned',
    cancelled_at = NULL,
    purge_at = NULL,
    organizer_id = v_me
  WHERE id = p_id
    AND status = 'cancelled'
    AND starts_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not revivable';
  END IF;

  UPDATE public.experience_participants
  SET role = 'participant'
  WHERE experience_id = p_id;

  UPDATE public.experience_participants
  SET role = 'organizer'
  WHERE experience_id = p_id AND user_id = v_me;
END;
$$;

REVOKE ALL ON FUNCTION public.revive_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revive_experience(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Multi-participant transform
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transform_experience_to_memory(p_experience_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp         public.experiences%ROWTYPE;
  v_memory_id   uuid;
  v_now         timestamptz := NOW();
  v_part        record;
BEGIN
  SELECT * INTO v_exp
  FROM public.experiences e
  WHERE e.id = p_experience_id
    AND e.status = 'planned'
    AND e.transform_at <= v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.memories (
    source_experience_id,
    created_by,
    organizer_id_at_transform,
    leader_id,
    title,
    description,
    location_name,
    location_latitude,
    location_longitude,
    happened_starts_at,
    happened_ends_at,
    transformed_at,
    visibility,
    inspired_by_opportunity_id,
    edit_info_policy,
    add_media_policy,
    updated_by
  )
  VALUES (
    v_exp.id,
    v_exp.created_by,
    v_exp.organizer_id,
    v_exp.organizer_id,
    v_exp.title,
    v_exp.description,
    v_exp.location_name,
    v_exp.location_latitude,
    v_exp.location_longitude,
    v_exp.starts_at,
    v_exp.ends_at,
    v_now,
    v_exp.visibility,
    v_exp.inspired_by_opportunity_id,
    v_exp.edit_info_policy,
    'all_participants',
    v_exp.organizer_id
  )
  RETURNING id INTO v_memory_id;

  FOR v_part IN
    SELECT ep.user_id, ep.role, ep.joined_at
    FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
    ORDER BY ep.joined_at ASC
  LOOP
    INSERT INTO public.memory_participants (memory_id, user_id, role, joined_at)
    VALUES (
      v_memory_id,
      v_part.user_id,
      CASE
        WHEN v_part.user_id = v_exp.organizer_id THEN 'organizer'::public.memory_participant_role
        ELSE v_part.role
      END,
      v_part.joined_at
    );
  END LOOP;

  DELETE FROM public.experiences WHERE id = v_exp.id;

  RETURN v_memory_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transform_my_due_experiences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_exp_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  FOR v_exp_id IN
    SELECT DISTINCT e.id
    FROM public.experiences e
    JOIN public.experience_participants ep
      ON ep.experience_id = e.id
     AND ep.user_id = v_me
    WHERE e.status = 'planned'
      AND e.transform_at <= NOW()
    FOR UPDATE OF e
  LOOP
    PERFORM public.transform_experience_to_memory(v_exp_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_experience_transformed(p_experience_id uuid)
RETURNS uuid
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

  IF NOT public.is_experience_participant(p_experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  RETURN public.transform_experience_to_memory(p_experience_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_experience_edit_policy(
  p_experience_id uuid,
  p_policy        public.memory_permission_policy
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

  UPDATE public.experiences
  SET edit_info_policy = p_policy
  WHERE id = p_experience_id
    AND organizer_id = v_me
    AND status IN ('planned', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_experience_edit_policy(uuid, public.memory_permission_policy) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_experience_edit_policy(uuid, public.memory_permission_policy) TO authenticated;
