-- Migration: experience viewer role flags + pending-invitee participant read access

DROP FUNCTION IF EXISTS public.get_experience(uuid);

CREATE OR REPLACE FUNCTION public.get_experience(p_id uuid)
RETURNS TABLE (
  id                     uuid,
  title                  text,
  description            text,
  location_name          text,
  location_latitude      double precision,
  location_longitude     double precision,
  starts_at              timestamptz,
  ends_at                timestamptz,
  transform_at           timestamptz,
  visibility             public.experience_visibility,
  status                 public.experience_status,
  cancelled_at           timestamptz,
  purge_at               timestamptz,
  organizer_id           uuid,
  edit_info_policy       public.memory_permission_policy,
  am_organizer           boolean,
  am_participant         boolean,
  pending_invitation_id  uuid,
  can_revive             boolean,
  notifications_muted    boolean,
  created_at             timestamptz,
  updated_at             timestamptz
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
    (ep_me.user_id IS NOT NULL),
    inv.id,
    (ep_me.user_id IS NOT NULL AND e.status = 'cancelled' AND e.starts_at > NOW()),
    COALESCE(ep_me.notifications_muted, false),
    e.created_at,
    e.updated_at
  FROM public.experiences e
  LEFT JOIN public.experience_participants ep_me
    ON ep_me.experience_id = e.id
   AND ep_me.user_id = auth.uid()
  LEFT JOIN public.experience_invitations inv
    ON inv.experience_id = e.id
   AND inv.invitee_id = auth.uid()
   AND inv.status = 'pending'
  WHERE e.id = p_id
    AND (
      ep_me.user_id IS NOT NULL
      OR inv.id IS NOT NULL
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_experience(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_experience_participants(p_experience_id uuid)
RETURNS TABLE (
  participant_id uuid,
  user_id        uuid,
  role           public.memory_participant_role,
  joined_at      timestamptz,
  username       text,
  display_name   text,
  avatar_url     text,
  is_organizer   boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ep.id,
    ep.user_id,
    ep.role,
    ep.joined_at,
    p.username,
    p.display_name,
    p.avatar_url,
    (ep.user_id = e.organizer_id)
  FROM public.experience_participants ep
  JOIN public.experiences e ON e.id = ep.experience_id
  LEFT JOIN public.profiles p ON p.id = ep.user_id
  WHERE ep.experience_id = p_experience_id
    AND (
      public.is_experience_participant(p_experience_id)
      OR public.is_pending_experience_invitee(p_experience_id)
    )
  ORDER BY ep.joined_at ASC, ep.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_experience_participants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_experience_participants(uuid) TO authenticated;

CREATE POLICY "experience_participants_select_pending_invitee"
  ON public.experience_participants
  FOR SELECT
  TO authenticated
  USING (public.is_pending_experience_invitee(experience_id));
