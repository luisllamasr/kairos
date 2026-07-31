-- Migration: lifecycle lock-ordering hardening (post-M15 production-readiness audit)
--
-- transform_my_due_experiences() and purge_my_stale_experiences() lock multiple
-- experience rows via `FOR UPDATE OF e` without a deterministic order or
-- SKIP LOCKED, unlike their cron counterparts (transform_due_experiences,
-- purge_stale_experiences), which already use `ORDER BY ... FOR UPDATE SKIP LOCKED`.
--
-- Two concurrent callers that both touch the same set of shared experiences
-- (e.g. two participants opening Home at the same time, or a client call
-- racing the 15-minute cron) can lock overlapping rows in different orders and
-- deadlock. Align both client-triggered functions with the cron pattern.
--
-- SKIP LOCKED is safe here: if a row is already locked by another in-flight
-- transform/purge, that process will complete the same idempotent operation,
-- and the next list load re-runs this function anyway.

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
    ORDER BY e.transform_at ASC, e.id ASC
    FOR UPDATE OF e SKIP LOCKED
  LOOP
    PERFORM public.transform_experience_to_memory(v_exp_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.transform_my_due_experiences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transform_my_due_experiences() TO authenticated;

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
    ORDER BY e.purge_at ASC, e.id ASC
    FOR UPDATE OF e SKIP LOCKED
  LOOP
    DELETE FROM public.experiences WHERE id = v_exp_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_my_stale_experiences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_my_stale_experiences() TO authenticated;
