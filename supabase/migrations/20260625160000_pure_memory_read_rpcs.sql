-- Migration: pure memory read RPCs
--
-- Read RPCs must not run DELETE/INSERT (STABLE + read-only transaction → 25006).
-- Side effects belong in dedicated write RPCs, crons, and triggers.
--
--   • list / count / get memories → LANGUAGE sql, SELECT only
--   • transform_my_due_experiences → explicit client/cron write RPC
--   • purge_orphaned_memory_rows → daily maintenance cron only (CASCADE is normal path)

DROP FUNCTION IF EXISTS public.list_my_memories(text);
DROP FUNCTION IF EXISTS public.list_my_memories_query(text);
DROP FUNCTION IF EXISTS public.get_memory(uuid);
DROP FUNCTION IF EXISTS public.get_memory_query(uuid);
DROP FUNCTION IF EXISTS public.prepare_memory_reads();
DROP FUNCTION IF EXISTS public.count_my_memories();

CREATE OR REPLACE FUNCTION public.list_my_memories(p_search text DEFAULT NULL)
RETURNS TABLE (
  id                 uuid,
  title              text,
  location_name      text,
  happened_starts_at timestamptz,
  happened_ends_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.list_my_memories(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_memories(text) TO authenticated;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_memory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_memory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_my_memories()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.memory_participants mp
  JOIN public.memories m ON m.id = mp.memory_id
  WHERE mp.user_id = auth.uid()
    AND mp.left_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.count_my_memories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_my_memories() TO authenticated;

-- Daily maintenance: child-row orphans (manual DB edits) + memory rows with no active participants.
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
