-- Eager purge for cancelled experiences past purge_at.
-- Mirrors transform_my_due_experiences: explicit client write RPC before Home list,
-- plus purge_stale_experiences() on the 15-minute transform cron as a server safety net.

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
    SELECT DISTINCT e.id
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

DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id FROM cron.job WHERE jobname = 'transform-due-experiences';
  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'transform-due-experiences',
  '*/15 * * * *',
  $$SELECT public.transform_due_experiences(); SELECT public.purge_stale_experiences();$$
);
