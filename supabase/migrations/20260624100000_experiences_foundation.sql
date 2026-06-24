-- Migration: experiences foundation (milestone 12)
--
-- Product rules:
--   • Experiences are dated plans (starts_at + ends_at required) — not Ideas.
--   • visibility: private | public (M12 enforces private only in RPCs).
--   • No manual complete — transform_at = ends_at + 3 hours; M13 transform RPC.
--   • Cancel = plan no longer happening; purge_at = ends_at + 24 hours.
--   • Remove = user no longer wants this in their Kairos; M12 solo hard-deletes row.
--   • M14: remove participation; hard-delete experience when no participants remain.
--   • Location: location_name + optional lat/lng for future maps (M12 uses name only).
--   • created_by = immutable audit; organizer_id = permission checks.
--   • Home lists planned (transform_at > now) + cancelled (purge_at > now).
--
-- M13 handoff: transform_experience_to_memory() when transform_at <= now().

-- -----------------------------------------------------------------------------
-- 1. Enums + table
-- -----------------------------------------------------------------------------

CREATE TYPE public.experience_status AS ENUM ('planned', 'cancelled');

CREATE TYPE public.experience_visibility AS ENUM ('private', 'public');

CREATE TABLE public.experiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  created_by    UUID NOT NULL,
  organizer_id  UUID NOT NULL,

  title         TEXT NOT NULL,
  description   TEXT,
  location_name TEXT,
  location_latitude  DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,

  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,

  visibility    public.experience_visibility NOT NULL DEFAULT 'private',
  status        public.experience_status NOT NULL DEFAULT 'planned',

  transform_at  TIMESTAMPTZ NOT NULL,
  cancelled_at  TIMESTAMPTZ,
  purge_at      TIMESTAMPTZ,

  inspired_by_opportunity_id UUID,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT experiences_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experiences_organizer_id_fkey
    FOREIGN KEY (organizer_id) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experiences_title_valid
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120),

  CONSTRAINT experiences_description_length
    CHECK (description IS NULL OR char_length(description) <= 2000),

  CONSTRAINT experiences_location_name_length
    CHECK (location_name IS NULL OR char_length(trim(location_name)) <= 200),

  CONSTRAINT experiences_location_coordinates_pair
    CHECK (
      (location_latitude IS NULL AND location_longitude IS NULL)
      OR (location_latitude IS NOT NULL AND location_longitude IS NOT NULL)
    ),

  CONSTRAINT experiences_location_latitude_range
    CHECK (location_latitude IS NULL OR (location_latitude >= -90 AND location_latitude <= 90)),

  CONSTRAINT experiences_location_longitude_range
    CHECK (location_longitude IS NULL OR (location_longitude >= -180 AND location_longitude <= 180)),

  CONSTRAINT experiences_time_order
    CHECK (ends_at > starts_at),

  CONSTRAINT experiences_cancelled_consistent
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),

  CONSTRAINT experiences_transform_after_end
    CHECK (transform_at >= ends_at)
);

COMMENT ON TABLE public.experiences IS
  'Ephemeral dated plans. Transform to memories (M13) at transform_at; cancelled rows purge at purge_at.';

CREATE INDEX experiences_organizer_planned_idx
  ON public.experiences (organizer_id, starts_at ASC)
  WHERE status = 'planned';

CREATE INDEX experiences_organizer_cancelled_idx
  ON public.experiences (organizer_id, starts_at ASC)
  WHERE status = 'cancelled';

CREATE INDEX experiences_purge_at_idx
  ON public.experiences (purge_at)
  WHERE purge_at IS NOT NULL;

CREATE INDEX experiences_transform_at_idx
  ON public.experiences (transform_at)
  WHERE status = 'planned';

CREATE TRIGGER set_experiences_updated_at
  BEFORE UPDATE ON public.experiences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_experience_transform_at(p_ends_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_ends_at + interval '3 hours';
$$;

REVOKE ALL ON FUNCTION public.compute_experience_transform_at(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.compute_experience_cancel_purge_at(p_ends_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_ends_at + interval '24 hours';
$$;

REVOKE ALL ON FUNCTION public.compute_experience_cancel_purge_at(timestamptz) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. Grants + RLS
-- -----------------------------------------------------------------------------

GRANT SELECT ON TABLE public.experiences TO authenticated;

ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiences_select_organizer"
  ON public.experiences
  FOR SELECT
  TO authenticated
  USING (organizer_id = auth.uid());

-- Writes via SECURITY DEFINER RPCs only.

-- -----------------------------------------------------------------------------
-- 4. Read RPCs (SECURITY INVOKER)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_my_home_experiences()
RETURNS TABLE (
  id           uuid,
  title        text,
  location_name        text,
  location_latitude    double precision,
  location_longitude   double precision,
  starts_at    timestamptz,
  ends_at      timestamptz,
  transform_at timestamptz,
  status       public.experience_status,
  purge_at     timestamptz
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
  id           uuid,
  title        text,
  description  text,
  location_name        text,
  location_latitude    double precision,
  location_longitude   double precision,
  starts_at    timestamptz,
  ends_at      timestamptz,
  transform_at timestamptz,
  visibility   public.experience_visibility,
  status       public.experience_status,
  cancelled_at timestamptz,
  purge_at     timestamptz,
  created_at   timestamptz,
  updated_at   timestamptz
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

-- -----------------------------------------------------------------------------
-- 5. Write RPCs (SECURITY DEFINER)
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

REVOKE ALL ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision) TO authenticated;

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

REVOKE ALL ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision) TO authenticated;

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
    -- Idempotent if already cancelled.
    IF EXISTS (
      SELECT 1 FROM public.experiences e
      WHERE e.id = p_id AND e.organizer_id = v_me AND e.status = 'cancelled'
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'not cancellable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_experience(uuid) TO authenticated;

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

  -- M12: sole organizer — hard DELETE row (planned or cancelled before purge).
  -- M14: replace with participant removal; hard DELETE only when last participant leaves.
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

-- -----------------------------------------------------------------------------
-- 6. Purge cancelled experiences (purge_at = ends_at + 24h)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_stale_experiences()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.experiences
  WHERE purge_at IS NOT NULL
    AND purge_at < NOW();
$$;

REVOKE EXECUTE ON FUNCTION public.purge_stale_experiences() FROM PUBLIC;

DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id
  FROM cron.job
  WHERE jobname = 'purge-stale-experiences-daily';

  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'purge-stale-experiences-daily',
  '0 5 * * *',
  $$SELECT public.purge_stale_experiences()$$
);
