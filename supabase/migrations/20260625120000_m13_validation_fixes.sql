-- Migration: M13 validation fixes
--
-- 1. Transform user's due experiences before memory reads (not only from detail/cron).
-- 2. Harden memory read RPCs as SECURITY DEFINER (explicit auth.uid() checks).
-- 3. Grant EXECUTE on memory helper functions used by read RPCs.
-- 4. Reject experience starts_at in the past (10-minute buffer for last-minute plans).

-- -----------------------------------------------------------------------------
-- 1. Transform helper + experience future-start guard
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.experience_min_starts_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOW() + interval '10 minutes';
$$;

REVOKE ALL ON FUNCTION public.experience_min_starts_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.experience_min_starts_at() TO authenticated;

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
    SELECT e.id
    FROM public.experiences e
    WHERE e.organizer_id = v_me
      AND e.status = 'planned'
      AND e.transform_at <= NOW()
    FOR UPDATE OF e
  LOOP
    PERFORM public.transform_experience_to_memory(v_exp_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.transform_my_due_experiences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transform_my_due_experiences() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_active_memory_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.memory_has_active_participants(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Experience create/update — starts_at must be in the near future
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_experience(
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_starts_at            timestamptz,
  p_ends_at              timestamptz,
  p_location_latitude    double precision DEFAULT NULL,
  p_location_longitude   double precision DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid;
  v_id  uuid;
  v_title text;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
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

  INSERT INTO public.experiences (
    created_by,
    organizer_id,
    title,
    description,
    location_name,
    location_latitude,
    location_longitude,
    starts_at,
    ends_at,
    visibility,
    status,
    transform_at
  )
  VALUES (
    v_me,
    v_me,
    v_title,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_location_name), ''),
    p_location_latitude,
    p_location_longitude,
    p_starts_at,
    p_ends_at,
    'private',
    'planned',
    public.compute_experience_transform_at(p_ends_at)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_experience(
  p_id                   uuid,
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_starts_at            timestamptz,
  p_ends_at              timestamptz,
  p_location_latitude    double precision DEFAULT NULL,
  p_location_longitude   double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid;
  v_title text;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
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
    transform_at = public.compute_experience_transform_at(p_ends_at)
  WHERE id = p_id
    AND organizer_id = v_me
    AND status = 'planned'
    AND transform_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Friend count + memory read RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.count_my_friends()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.friendships f
  WHERE f.status = 'accepted'
    AND (f.user_low_id = auth.uid() OR f.user_high_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.count_my_friends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_my_friends() TO authenticated;

CREATE OR REPLACE FUNCTION public.count_my_memories()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.transform_my_due_experiences();

  RETURN (
    SELECT COUNT(*)::integer
    FROM public.memory_participants mp
    WHERE mp.user_id = auth.uid()
      AND mp.left_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_memories(p_search text DEFAULT NULL)
RETURNS TABLE (
  id                 uuid,
  title              text,
  location_name      text,
  happened_starts_at timestamptz,
  happened_ends_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.transform_my_due_experiences();

  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.location_name,
    m.happened_starts_at,
    m.happened_ends_at
  FROM public.memories m
  JOIN public.memory_participants mp
    ON mp.memory_id = m.id
   AND mp.user_id = auth.uid()
   AND mp.left_at IS NULL
  WHERE p_search IS NULL
     OR btrim(p_search) = ''
     OR m.title ILIKE '%' || btrim(p_search) || '%'
  ORDER BY m.happened_starts_at DESC, m.transformed_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_memory(p_id uuid)
RETURNS TABLE (
  id                        uuid,
  title                     text,
  description               text,
  location_name             text,
  location_latitude         double precision,
  location_longitude        double precision,
  happened_starts_at        timestamptz,
  happened_ends_at          timestamptz,
  transformed_at            timestamptz,
  leader_id                 uuid,
  edit_info_policy          public.memory_permission_policy,
  add_media_policy          public.memory_permission_policy,
  my_personal_note          text,
  am_leader                 boolean,
  updated_at                timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.description,
    m.location_name,
    m.location_latitude,
    m.location_longitude,
    m.happened_starts_at,
    m.happened_ends_at,
    m.transformed_at,
    m.leader_id,
    m.edit_info_policy,
    m.add_media_policy,
    mp.personal_note,
    (m.leader_id = auth.uid()),
    m.updated_at
  FROM public.memories m
  JOIN public.memory_participants mp
    ON mp.memory_id = m.id
   AND mp.user_id = auth.uid()
   AND mp.left_at IS NULL
  WHERE m.id = p_id;
END;
$$;
