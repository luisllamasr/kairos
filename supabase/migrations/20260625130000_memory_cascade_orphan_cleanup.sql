-- Migration: memory cascade audit + orphan cleanup
--
-- Child rows must disappear when a memory row is deleted (manual admin delete included).
-- Re-assert ON DELETE CASCADE and purge orphaned participants/media if memory is gone.

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

COMMENT ON CONSTRAINT memory_participants_memory_fkey ON public.memory_participants IS
  'Deleting a memory removes all participant rows (distinct from leave → left_at).';

COMMENT ON CONSTRAINT memory_media_memory_fkey ON public.memory_media IS
  'Deleting a memory removes all media metadata rows. Storage cleanup is separate.';

-- -----------------------------------------------------------------------------
-- 2. Orphan purge — safety net after manual DB edits
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
-- 3. Read RPCs — purge orphans first; count only participants with a live memory
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.count_my_memories()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.purge_orphaned_memory_rows();
  PERFORM public.transform_my_due_experiences();

  RETURN (
    SELECT COUNT(*)::integer
    FROM public.memory_participants mp
    JOIN public.memories m ON m.id = mp.memory_id
    WHERE mp.user_id = auth.uid()
      AND mp.left_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_my_memories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_my_memories() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_memories(p_search text DEFAULT NULL)
RETURNS TABLE (
  id                 uuid,
  title              text,
  location_name      text,
  happened_starts_at timestamptz,
  happened_ends_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.purge_orphaned_memory_rows();
  PERFORM public.transform_my_due_experiences();

  RETURN QUERY
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
END;
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.purge_orphaned_memory_rows();

  RETURN QUERY
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
END;
$$;

REVOKE ALL ON FUNCTION public.get_memory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_memory(uuid) TO authenticated;
