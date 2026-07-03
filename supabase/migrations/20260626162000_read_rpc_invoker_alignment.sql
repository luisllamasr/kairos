-- Migration: read RPC invoker alignment (pre-M15 security review)
--
-- Memory read RPCs and mark_notification_read are pure access-control reads/writes
-- already enforced by RLS. SECURITY INVOKER aligns them with experience reads and
-- the notifications list/count RPCs; no logic changes.

-- -----------------------------------------------------------------------------
-- 1. Memory read RPCs → SECURITY INVOKER
-- -----------------------------------------------------------------------------

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
SECURITY INVOKER
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
SECURITY INVOKER
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

CREATE OR REPLACE FUNCTION public.list_memory_participants(p_memory_id uuid)
RETURNS TABLE (
  participant_id uuid,
  user_id        uuid,
  joined_at      timestamptz,
  left_at        timestamptz,
  username       text,
  display_name   text,
  avatar_url     text,
  is_leader      boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    mp.id,
    mp.user_id,
    mp.joined_at,
    mp.left_at,
    p.username,
    p.display_name,
    p.avatar_url,
    (mp.user_id IS NOT NULL AND mp.user_id = m.leader_id)
  FROM public.memory_participants mp
  JOIN public.memories m ON m.id = mp.memory_id
  LEFT JOIN public.profiles p ON p.id = mp.user_id
  WHERE mp.memory_id = p_memory_id
    AND public.is_active_memory_participant(p_memory_id)
  ORDER BY mp.joined_at ASC, mp.id ASC;
$$;

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
SECURITY INVOKER
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

-- -----------------------------------------------------------------------------
-- 2. mark_notification_read → SECURITY INVOKER
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET read_at = NOW()
  WHERE id = p_notification_id
    AND recipient_id = auth.uid()
    AND read_at IS NULL;
END;
$$;
