-- Migration: M14 client read helpers
--
-- Expose friend user_id for invite pickers and notifications_muted on get_experience.

DROP FUNCTION IF EXISTS public.list_friends();

CREATE OR REPLACE FUNCTION public.list_friends()
RETURNS TABLE (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE
      WHEN f.user_low_id = auth.uid() THEN f.user_high_id
      ELSE f.user_low_id
    END
  WHERE f.status = 'accepted'
    AND (f.user_low_id = auth.uid() OR f.user_high_id = auth.uid())
    AND p.username IS NOT NULL
  ORDER BY COALESCE(f.responded_at, f.created_at) DESC, p.username ASC;
$$;

REVOKE ALL ON FUNCTION public.list_friends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_friends() TO authenticated;

DROP FUNCTION IF EXISTS public.get_experience(uuid);

CREATE OR REPLACE FUNCTION public.get_experience(p_id uuid)
RETURNS TABLE (
  id                   uuid,
  title                text,
  description          text,
  location_name        text,
  location_latitude    double precision,
  location_longitude   double precision,
  starts_at            timestamptz,
  ends_at              timestamptz,
  transform_at         timestamptz,
  visibility           public.experience_visibility,
  status               public.experience_status,
  cancelled_at         timestamptz,
  purge_at             timestamptz,
  organizer_id         uuid,
  edit_info_policy     public.memory_permission_policy,
  am_organizer         boolean,
  can_revive           boolean,
  notifications_muted  boolean,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.location_name,
    e.location_latitude,
    e.location_longitude,
    e.starts_at,
    e.ends_at,
    e.transform_at,
    e.visibility,
    e.status,
    e.cancelled_at,
    e.purge_at,
    e.organizer_id,
    e.edit_info_policy,
    (e.organizer_id = auth.uid()),
    (e.status = 'cancelled' AND e.starts_at > NOW()),
    COALESCE(ep_me.notifications_muted, false),
    e.created_at,
    e.updated_at
  FROM public.experiences e
  LEFT JOIN public.experience_participants ep_me
    ON ep_me.experience_id = e.id
   AND ep_me.user_id = auth.uid()
  WHERE e.id = p_id
    AND public.is_experience_participant(p_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_experience(uuid) TO authenticated;
