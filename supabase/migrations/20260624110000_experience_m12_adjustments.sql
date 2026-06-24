-- Milestone 12 adjustments for databases that applied experiences_foundation v1
-- (location text column + delete planned-only). Safe to skip on fresh installs that
-- already include the updated 20260624100000 migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'experiences'
      AND column_name = 'location'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'experiences'
      AND column_name = 'location_name'
  ) THEN
    ALTER TABLE public.experiences RENAME COLUMN location TO location_name;
  END IF;
END $$;

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS location_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_longitude DOUBLE PRECISION;

ALTER TABLE public.experiences DROP CONSTRAINT IF EXISTS experiences_location_length;

ALTER TABLE public.experiences
  DROP CONSTRAINT IF EXISTS experiences_location_name_length,
  DROP CONSTRAINT IF EXISTS experiences_location_coordinates_pair,
  DROP CONSTRAINT IF EXISTS experiences_location_latitude_range,
  DROP CONSTRAINT IF EXISTS experiences_location_longitude_range;

ALTER TABLE public.experiences
  ADD CONSTRAINT experiences_location_name_length
    CHECK (location_name IS NULL OR char_length(trim(location_name)) <= 200),
  ADD CONSTRAINT experiences_location_coordinates_pair
    CHECK (
      (location_latitude IS NULL AND location_longitude IS NULL)
      OR (location_latitude IS NOT NULL AND location_longitude IS NOT NULL)
    ),
  ADD CONSTRAINT experiences_location_latitude_range
    CHECK (location_latitude IS NULL OR (location_latitude >= -90 AND location_latitude <= 90)),
  ADD CONSTRAINT experiences_location_longitude_range
    CHECK (location_longitude IS NULL OR (location_longitude >= -180 AND location_longitude <= 180));

DROP FUNCTION IF EXISTS public.create_experience(text, text, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.update_experience(uuid, text, text, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.list_my_home_experiences();
DROP FUNCTION IF EXISTS public.get_experience(uuid);

CREATE OR REPLACE FUNCTION public.list_my_home_experiences()
RETURNS TABLE (
  id                   uuid,
  title                text,
  location_name        text,
  location_latitude    double precision,
  location_longitude   double precision,
  starts_at            timestamptz,
  ends_at              timestamptz,
  transform_at         timestamptz,
  status               public.experience_status,
  purge_at             timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.location_name,
    e.location_latitude,
    e.location_longitude,
    e.starts_at,
    e.ends_at,
    e.transform_at,
    e.status,
    e.purge_at
  FROM public.experiences e
  WHERE e.organizer_id = auth.uid()
    AND (
      (e.status = 'planned' AND e.transform_at > NOW())
      OR (e.status = 'cancelled' AND e.purge_at IS NOT NULL AND e.purge_at > NOW())
    )
  ORDER BY e.starts_at ASC, e.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_my_home_experiences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_home_experiences() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_experience(p_id uuid)
RETURNS TABLE (
  id                   uuid,
  title                text,
  description          text,
  location_name        text,
  location_latitude    double precision,
  location_longitude   double precision,
  starts_at            timestamptz,
  ends_at              timestamptz,
  transform_at         timestamptz,
  visibility           public.experience_visibility,
  status               public.experience_status,
  cancelled_at         timestamptz,
  purge_at             timestamptz,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.location_name,
    e.location_latitude,
    e.location_longitude,
    e.starts_at,
    e.ends_at,
    e.transform_at,
    e.visibility,
    e.status,
    e.cancelled_at,
    e.purge_at,
    e.created_at,
    e.updated_at
  FROM public.experiences e
  WHERE e.id = p_id
    AND e.organizer_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_experience(uuid) TO authenticated;

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
  WHERE id = p_id
    AND organizer_id = v_me
    AND status = 'planned'
    AND transform_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not updatable';
  END IF;
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
    RAISE EXCEPTION 'not removable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_experience(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision) TO authenticated;

REVOKE ALL ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision) TO authenticated;
