-- Privacy v1 (locked design -- see docs/PROJECT.md, Core principles -> 6):
-- 1. profiles.memories_visibility (only_me | friends | everyone) -- who can see
--    a user's memories on their own profile.
-- 2. memory_participants.profile_visible -- per-participant, per-memory opt-out
--    from a participant's own profile only. Never removes participation, never
--    changes the shared memory for anyone else.
-- 3. One canonical, reusable visibility predicate (are_friends ->
--    can_view_owner_memories_on_profile -> can_view_memory_publicly), used by
--    every new public read RPC AND by the memories storage SELECT policy, so
--    there is exactly one place this rule is defined.
-- 4. Public read RPCs never return participant rows or uploaded_by_user_id --
--    identity is withheld by the response shape itself, not by client
--    discipline. Only a participant_count is exposed.
-- 5. Existing participant-only RLS/RPCs (list_my_memories, get_memory,
--    list_memory_participants, list_memory_media, storage INSERT/DELETE) are
--    untouched. Only the storage SELECT policy gets a new OR branch.

-- -----------------------------------------------------------------------------
-- 1. Schema: visibility settings
-- -----------------------------------------------------------------------------

CREATE TYPE public.memory_visibility AS ENUM ('only_me', 'friends', 'everyone');

-- Default 'friends' -- matches the onboarding pre-selected option and is the
-- backfill value for every existing account (fast default-backfill, no
-- separate UPDATE needed).
ALTER TABLE public.profiles
  ADD COLUMN memories_visibility public.memory_visibility NOT NULL DEFAULT 'friends';

-- Default true (opt-out, not opt-in) -- a shared memory shows on a
-- participant's profile unless they choose to hide that one memory.
ALTER TABLE public.memory_participants
  ADD COLUMN profile_visible boolean NOT NULL DEFAULT true;

-- -----------------------------------------------------------------------------
-- 2. Canonical visibility predicates
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.are_friends(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.user_low_id = LEAST(a, b)
      AND f.user_high_id = GREATEST(a, b)
      AND f.status = 'accepted'
  );
$$;

REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;

-- Can p_viewer_id see p_owner_id's memories via p_owner_id's own profile?
-- Evaluated per-owner -- this is the only place memories_visibility is read.
CREATE OR REPLACE FUNCTION public.can_view_owner_memories_on_profile(
  p_owner_id uuid,
  p_viewer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_owner_id IS NULL OR p_viewer_id IS NULL THEN false
    WHEN p_owner_id = p_viewer_id THEN true
    ELSE COALESCE(
      (
        SELECT CASE p.memories_visibility
          WHEN 'everyone' THEN true
          WHEN 'friends'  THEN public.are_friends(p_owner_id, p_viewer_id)
          ELSE false
        END
        FROM public.profiles p
        WHERE p.id = p_owner_id
      ),
      false
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.can_view_owner_memories_on_profile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_owner_memories_on_profile(uuid, uuid) TO authenticated;

-- Can p_viewer_id open the full memory (locked "OR across participants" rule):
-- true iff at least one active participant made it visible via their own
-- profile settings -- independent of any other participant's setting.
CREATE OR REPLACE FUNCTION public.can_view_memory_publicly(
  p_memory_id uuid,
  p_viewer_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_participants mp
    WHERE mp.memory_id = p_memory_id
      AND mp.user_id IS NOT NULL
      AND mp.left_at IS NULL
      AND mp.profile_visible = true
      AND public.can_view_owner_memories_on_profile(mp.user_id, p_viewer_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_memory_publicly(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_memory_publicly(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Storage: memories bucket SELECT gets a public-visibility OR branch
--    (INSERT/DELETE stay participant-only -- unchanged).
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "memories_participant_select" ON storage.objects;

CREATE POLICY "memories_participant_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'memories'
    AND (
      public.is_active_memory_participant(
        (storage.foldername(objects.name))[1]::uuid
      )
      OR public.can_view_memory_publicly(
        (storage.foldername(objects.name))[1]::uuid
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. get_public_profile grows identity stats (friend / memory / mutual counts)
--    Return type changes -- CREATE OR REPLACE cannot change OUT params.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_public_profile(text);

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  username             text,
  display_name         text,
  avatar_url           text,
  relationship_status  text,
  friend_count         integer,
  memory_count         integer,
  -- NULL when viewing your own profile (mutual-with-self is meaningless).
  mutual_friend_count  integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.username,
    p.display_name,
    p.avatar_url,
    COALESCE(
      (
        SELECT CASE
          WHEN f.status = 'accepted' THEN 'friends'
          WHEN f.initiated_by = auth.uid() THEN 'pending_outgoing'
          ELSE 'pending_incoming'
        END
        FROM public.friendships f
        WHERE f.user_low_id = LEAST(auth.uid(), p.id)
          AND f.user_high_id = GREATEST(auth.uid(), p.id)
      ),
      'none'
    ) AS relationship_status,
    (
      SELECT COUNT(*)::integer
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (f.user_low_id = p.id OR f.user_high_id = p.id)
    ) AS friend_count,
    (
      SELECT COUNT(*)::integer
      FROM public.memory_participants mp
      WHERE mp.user_id = p.id
        AND mp.left_at IS NULL
    ) AS memory_count,
    CASE
      WHEN p.id = auth.uid() THEN NULL
      ELSE (
        SELECT COUNT(*)::integer
        FROM (
          SELECT CASE WHEN f.user_low_id = p.id THEN f.user_high_id ELSE f.user_low_id END AS friend_id
          FROM public.friendships f
          WHERE f.status = 'accepted'
            AND (f.user_low_id = p.id OR f.user_high_id = p.id)
        ) AS owner_friends
        WHERE owner_friends.friend_id IN (
          SELECT CASE WHEN f2.user_low_id = auth.uid() THEN f2.user_high_id ELSE f2.user_low_id END
          FROM public.friendships f2
          WHERE f2.status = 'accepted'
            AND (f2.user_low_id = auth.uid() OR f2.user_high_id = auth.uid())
        )
      )
    END AS mutual_friend_count
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.username = lower(trim(ltrim(p_username, '@')))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. New public read RPCs (SECURITY DEFINER -- reach beyond the caller's own
--    participant-only RLS on memories/memory_participants/memory_media).
--    None of these return participant rows or uploaded_by_user_id.
-- -----------------------------------------------------------------------------

-- Memory list surfaced on a specific profile (constrained to that owner).
CREATE OR REPLACE FUNCTION public.list_profile_memories(p_username text)
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
  WITH owner AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.username IS NOT NULL
      AND p.username = lower(trim(ltrim(p_username, '@')))
  )
  SELECT
    m.id,
    m.title,
    m.location_name,
    m.happened_starts_at,
    m.happened_ends_at
  FROM public.memories m
  JOIN public.memory_participants mp
    ON mp.memory_id = m.id
   AND mp.left_at IS NULL
   AND mp.profile_visible = true
  JOIN owner ON owner.id = mp.user_id
  WHERE public.can_view_owner_memories_on_profile(owner.id, auth.uid())
  ORDER BY m.happened_starts_at DESC, m.transformed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_profile_memories(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_profile_memories(text) TO authenticated;

-- Full memory detail for a non-participant viewer -- OR-across-participants,
-- not constrained to the profile the viewer arrived from (locked rule).
CREATE OR REPLACE FUNCTION public.get_public_memory(p_memory_id uuid)
RETURNS TABLE (
  id                 uuid,
  title              text,
  description        text,
  location_name      text,
  location_latitude  double precision,
  location_longitude double precision,
  happened_starts_at timestamptz,
  happened_ends_at   timestamptz,
  participant_count  integer
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
    (
      SELECT COUNT(*)::integer
      FROM public.memory_participants mp2
      WHERE mp2.memory_id = m.id
        AND mp2.user_id IS NOT NULL
        AND mp2.left_at IS NULL
    ) AS participant_count
  FROM public.memories m
  WHERE m.id = p_memory_id
    AND public.can_view_memory_publicly(m.id, auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_public_memory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_memory(uuid) TO authenticated;

-- Media for a public memory read -- no uploaded_by_user_id column at all.
CREATE OR REPLACE FUNCTION public.list_public_memory_media(p_memory_id uuid)
RETURNS TABLE (
  id           uuid,
  storage_path text,
  mime_type    text,
  sort_order   integer
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
    mm.sort_order
  FROM public.memory_media mm
  WHERE mm.memory_id = p_memory_id
    AND public.can_view_memory_publicly(p_memory_id, auth.uid())
  ORDER BY mm.sort_order ASC, mm.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_public_memory_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_memory_media(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Write RPC: per-memory "hide from my profile" (opt-out toggle)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_memory_profile_visibility(
  p_memory_id uuid,
  p_visible   boolean
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

  IF NOT public.is_active_memory_participant(p_memory_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.memory_participants
  SET profile_visible = p_visible
  WHERE memory_id = p_memory_id
    AND user_id = v_me
    AND left_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.set_memory_profile_visibility(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_memory_profile_visibility(uuid, boolean) TO authenticated;
