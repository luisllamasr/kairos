-- Fix purge_my_stale_experiences (DISTINCT + FOR UPDATE is invalid at runtime).
-- Same class of bug fixed in transform_my_due_experiences (261605).

CREATE OR REPLACE FUNCTION public.purge_my_stale_experiences()
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
    WHERE e.status = 'cancelled'
      AND e.purge_at IS NOT NULL
      AND e.purge_at < NOW()
    FOR UPDATE OF e
  LOOP
    DELETE FROM public.experiences WHERE id = v_exp_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_my_stale_experiences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_my_stale_experiences() TO authenticated;
