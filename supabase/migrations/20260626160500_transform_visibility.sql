-- Fix transform_my_due_experiences (DISTINCT + FOR UPDATE is invalid at runtime).
-- Home visibility: planned experiences stay listed until transform DELETEs the row.

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
  purge_at             timestamptz,
  organizer_id         uuid,
  am_organizer         boolean
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
    e.purge_at,
    e.organizer_id,
    (e.organizer_id = auth.uid())
  FROM public.experiences e
  JOIN public.experience_participants ep
    ON ep.experience_id = e.id
   AND ep.user_id = auth.uid()
  WHERE e.status = 'planned'
     OR (e.status = 'cancelled' AND e.purge_at IS NOT NULL AND e.purge_at > NOW())
  ORDER BY e.starts_at ASC, e.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_my_home_experiences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_home_experiences() TO authenticated;
