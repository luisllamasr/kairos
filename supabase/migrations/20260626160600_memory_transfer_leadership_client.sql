-- Expose memory leadership transfer to clients (matches transfer_experience_leadership).

CREATE OR REPLACE FUNCTION public.transfer_memory_leadership(
  p_memory_id     uuid,
  p_new_leader_id uuid
)
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.memories m
    WHERE m.id = p_memory_id
      AND m.leader_id = v_me
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memory_participants mp
    WHERE mp.memory_id = p_memory_id
      AND mp.user_id = p_new_leader_id
      AND mp.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid leader';
  END IF;

  UPDATE public.memories
  SET leader_id = p_new_leader_id
  WHERE id = p_memory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_memory_leadership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_memory_leadership(uuid, uuid) TO authenticated;
