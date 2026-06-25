-- Migration: fix memory read RPCs (42702 ambiguous column)
--
-- Root cause: list_my_memories / get_memory use plpgsql RETURNS TABLE (id, title, …)
-- with RETURN QUERY SELECT m.id, … — PostgreSQL error 42702 on every call.
-- Experiences use LANGUAGE sql for the same pattern and work fine.
--
-- Fix: SQL query functions + plpgsql wrappers that map non-conflicting column names.

CREATE OR REPLACE FUNCTION public.prepare_memory_reads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.purge_orphaned_memory_rows();
  PERFORM public.transform_my_due_experiences();
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_memory_reads() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.list_my_memories_query(p_search text DEFAULT NULL)
RETURNS TABLE (
  mem_id                 uuid,
  mem_title              text,
  mem_location_name      text,
  mem_happened_starts_at timestamptz,
  mem_happened_ends_at   timestamptz
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

REVOKE ALL ON FUNCTION public.list_my_memories_query(text) FROM PUBLIC;

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
  PERFORM public.prepare_memory_reads();

  RETURN QUERY
  SELECT
    q.mem_id,
    q.mem_title,
    q.mem_location_name,
    q.mem_happened_starts_at,
    q.mem_happened_ends_at
  FROM public.list_my_memories_query(p_search) q;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_memories(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_memories(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_memory_query(p_id uuid)
RETURNS TABLE (
  mem_id                 uuid,
  mem_title              text,
  mem_description        text,
  mem_location_name      text,
  mem_location_latitude  double precision,
  mem_location_longitude double precision,
  mem_happened_starts_at timestamptz,
  mem_happened_ends_at   timestamptz,
  mem_transformed_at     timestamptz,
  mem_leader_id          uuid,
  mem_edit_info_policy   public.memory_permission_policy,
  mem_add_media_policy   public.memory_permission_policy,
  mem_personal_note      text,
  mem_am_leader          boolean,
  mem_updated_at         timestamptz
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

REVOKE ALL ON FUNCTION public.get_memory_query(uuid) FROM PUBLIC;

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
  PERFORM public.prepare_memory_reads();

  RETURN QUERY
  SELECT
    q.mem_id,
    q.mem_title,
    q.mem_description,
    q.mem_location_name,
    q.mem_location_latitude,
    q.mem_location_longitude,
    q.mem_happened_starts_at,
    q.mem_happened_ends_at,
    q.mem_transformed_at,
    q.mem_leader_id,
    q.mem_edit_info_policy,
    q.mem_add_media_policy,
    q.mem_personal_note,
    q.mem_am_leader,
    q.mem_updated_at
  FROM public.get_memory_query(p_id) q;
END;
$$;

REVOKE ALL ON FUNCTION public.get_memory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_memory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_my_memories()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.prepare_memory_reads();

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
