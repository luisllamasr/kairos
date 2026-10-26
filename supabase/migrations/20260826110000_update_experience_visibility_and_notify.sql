-- M16 Phase 1: restore field-diff experience_updated notifications and stop
-- update_experience from forcing visibility = private.
--
-- Not in this migration: join_mode, capacity, discovery, join RPCs, requests,
-- visibility-transition RPCs, chat cutoff, membership mute.

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
  v_me               uuid;
  v_title            text;
  v_description      text;
  v_location_name    text;
  v_exp              public.experiences%ROWTYPE;
  v_changed          boolean;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT * INTO v_exp FROM public.experiences e WHERE e.id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_user_can(p_id, 'edit_info', v_me) THEN
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

  v_description := NULLIF(trim(p_description), '');
  v_location_name := NULLIF(trim(p_location_name), '');

  v_changed :=
    v_exp.title IS DISTINCT FROM v_title
    OR v_exp.description IS DISTINCT FROM v_description
    OR v_exp.location_name IS DISTINCT FROM v_location_name
    OR v_exp.location_latitude IS DISTINCT FROM p_location_latitude
    OR v_exp.location_longitude IS DISTINCT FROM p_location_longitude
    OR v_exp.starts_at IS DISTINCT FROM p_starts_at
    OR v_exp.ends_at IS DISTINCT FROM p_ends_at;

  UPDATE public.experiences
  SET
    title = v_title,
    description = v_description,
    location_name = v_location_name,
    location_latitude = p_location_latitude,
    location_longitude = p_location_longitude,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    transform_at = public.compute_experience_transform_at(p_ends_at)
  WHERE id = p_id;

  IF v_changed THEN
    PERFORM public.notify_experience_participants(
      p_id,
      'experience_updated',
      v_me,
      jsonb_build_object('fields', 'content'),
      v_me
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, timestamptz) IS
  'Leader-only plan-info edit before starts_at. Does not change visibility. Notifies experience_updated only when listed fields actually change.';

REVOKE ALL ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, timestamptz) TO authenticated;
