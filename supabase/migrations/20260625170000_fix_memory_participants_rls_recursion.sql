-- Migration: fix memory_participants RLS infinite recursion (42P17)
--
-- Root cause: SELECT policies on memory_participants (and memory_media) queried
-- memory_participants inside their own USING clause. SECURITY INVOKER read RPCs
-- (list_memory_participants, list_memory_media) triggered recursive policy evaluation.
--
-- Fix: delegate membership checks to is_active_memory_participant() (SECURITY DEFINER,
-- already used by write RPCs). Align participant/media list RPCs with other memory
-- reads (SECURITY DEFINER + explicit membership filter).

-- -----------------------------------------------------------------------------
-- 1. RLS — use DEFINER helper instead of self-referential subqueries
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "memories_select_active_participant" ON public.memories;
DROP POLICY IF EXISTS "memory_participants_select_fellow" ON public.memory_participants;
DROP POLICY IF EXISTS "memory_media_select_participant" ON public.memory_media;

CREATE POLICY "memories_select_active_participant"
  ON public.memories
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(id));

CREATE POLICY "memory_participants_select_fellow"
  ON public.memory_participants
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(memory_id));

CREATE POLICY "memory_media_select_participant"
  ON public.memory_media
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(memory_id));

GRANT EXECUTE ON FUNCTION public.is_active_memory_participant(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Read RPCs — SECURITY DEFINER (match list_my_memories / get_memory)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_memory_participants(p_memory_id uuid)
RETURNS TABLE (
  participant_id uuid,
  user_id        uuid,
  role           public.memory_participant_role,
  joined_at      timestamptz,
  left_at        timestamptz,
  username       text,
  display_name   text,
  avatar_url     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mp.id,
    mp.user_id,
    mp.role,
    mp.joined_at,
    mp.left_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.memory_participants mp
  LEFT JOIN public.profiles p ON p.id = mp.user_id
  WHERE mp.memory_id = p_memory_id
    AND public.is_active_memory_participant(p_memory_id)
  ORDER BY mp.joined_at ASC, mp.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_memory_participants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_memory_participants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_memory_media(p_memory_id uuid)
RETURNS TABLE (
  id                  uuid,
  storage_path        text,
  mime_type           text,
  byte_size           integer,
  sort_order          integer,
  created_at          timestamptz,
  uploaded_by_user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mm.id,
    mm.storage_path,
    mm.mime_type,
    mm.byte_size,
    mm.sort_order,
    mm.created_at,
    mm.uploaded_by_user_id
  FROM public.memory_media mm
  WHERE mm.memory_id = p_memory_id
    AND public.is_active_memory_participant(p_memory_id)
  ORDER BY mm.sort_order ASC, mm.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_memory_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_memory_media(uuid) TO authenticated;
