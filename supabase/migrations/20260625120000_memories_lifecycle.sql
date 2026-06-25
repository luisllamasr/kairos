-- Migration: memories lifecycle (M13 — squashed)
--
-- Orphan child-row cleanup, account-delete memory purge, daily maintenance cron.

-- -----------------------------------------------------------------------------
-- 1. Re-assert CASCADE foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE public.memory_participants
  DROP CONSTRAINT IF EXISTS memory_participants_memory_fkey;

ALTER TABLE public.memory_participants
  ADD CONSTRAINT memory_participants_memory_fkey
    FOREIGN KEY (memory_id) REFERENCES public.memories (id) ON DELETE CASCADE;

ALTER TABLE public.memory_media
  DROP CONSTRAINT IF EXISTS memory_media_memory_fkey;

ALTER TABLE public.memory_media
  ADD CONSTRAINT memory_media_memory_fkey
    FOREIGN KEY (memory_id) REFERENCES public.memories (id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 2. Orphan child-row purge (safety net after manual DB edits)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_orphaned_memory_rows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.memory_participants mp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.memories m WHERE m.id = mp.memory_id
  );

  DELETE FROM public.memory_media mm
  WHERE NOT EXISTS (
    SELECT 1 FROM public.memories m WHERE m.id = mm.memory_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_orphaned_memory_rows() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. Account delete — tombstone participants and purge orphaned memories
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_profile_delete_memories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_memory_id uuid;
  v_new_leader uuid;
  v_affected_memory_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT mp.memory_id), ARRAY[]::uuid[])
  INTO v_affected_memory_ids
  FROM public.memory_participants mp
  WHERE mp.user_id = OLD.id;

  FOR v_memory_id IN
    SELECT m.id FROM public.memories m WHERE m.leader_id = OLD.id
  LOOP
    v_new_leader := public.elect_memory_leader(v_memory_id, OLD.id);
    UPDATE public.memories
    SET leader_id = v_new_leader
    WHERE id = v_memory_id;
  END LOOP;

  UPDATE public.memory_participants
  SET user_id = NULL, personal_note = NULL
  WHERE user_id = OLD.id;

  IF v_affected_memory_ids IS NOT NULL THEN
    FOREACH v_memory_id IN ARRAY v_affected_memory_ids
    LOOP
      PERFORM public.purge_memory_if_orphaned(v_memory_id);
    END LOOP;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_profile_delete_memories() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_profile_delete_memories ON public.profiles;

CREATE TRIGGER on_profile_delete_memories
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_delete_memories();

-- -----------------------------------------------------------------------------
-- 4. Daily maintenance cron
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maintain_orphaned_memories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_orphaned_memory_rows();
  RETURN public.purge_orphaned_memories();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.maintain_orphaned_memories() FROM PUBLIC;

DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id FROM cron.job WHERE jobname = 'purge-orphaned-memories-daily';
  IF _job_id IS NOT NULL THEN PERFORM cron.unschedule(_job_id); END IF;
END;
$$;

SELECT cron.schedule(
  'purge-orphaned-memories-daily',
  '30 5 * * *',
  $$SELECT public.maintain_orphaned_memories()$$
);
