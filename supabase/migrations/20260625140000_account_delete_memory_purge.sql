-- Migration: account-delete memory purge
--
-- After tombstoning a deleted user's participant rows, purge memories with no
-- remaining active participants immediately — do not wait for daily cron.
-- Solo-user account delete should not leave ghost memory rows.

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
