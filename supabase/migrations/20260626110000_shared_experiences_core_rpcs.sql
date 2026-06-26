-- Migration: shared experiences core RPCs (milestone 14 — phase 2)
--
-- Participant visibility, invites, leave, leader remove, leadership transfer.

DROP FUNCTION IF EXISTS public.list_my_home_experiences();
DROP FUNCTION IF EXISTS public.get_experience(uuid);
DROP FUNCTION IF EXISTS public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision);

-- -----------------------------------------------------------------------------
-- 1. Internal — create invitation with shared guards
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_experience_invitation(
  p_experience_id   uuid,
  p_invitee_id      uuid,
  p_invited_by      uuid,
  p_suggestion_id   uuid DEFAULT NULL,
  p_require_leader_friendship boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_id  uuid;
BEGIN
  IF NOT public.experience_invites_allowed(p_experience_id) THEN
    RAISE EXCEPTION 'invites closed';
  END IF;

  IF public.is_experience_invite_blocked(p_experience_id, p_invitee_id) THEN
    RAISE EXCEPTION 'invite blocked';
  END IF;

  IF public.is_experience_participant(p_experience_id, p_invitee_id) THEN
    RAISE EXCEPTION 'already participant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.experience_invitations i
    WHERE i.experience_id = p_experience_id
      AND i.invitee_id = p_invitee_id
      AND i.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'invite pending';
  END IF;

  SELECT e.organizer_id INTO v_org
  FROM public.experiences e
  WHERE e.id = p_experience_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF p_require_leader_friendship
     AND NOT public.are_accepted_friends(v_org, p_invitee_id) THEN
    RAISE EXCEPTION 'not friends with leader';
  END IF;

  INSERT INTO public.experience_invitations (
    experience_id,
    invitee_id,
    invited_by,
    suggestion_id,
    status
  )
  VALUES (
    p_experience_id,
    p_invitee_id,
    p_invited_by,
    p_suggestion_id,
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_experience_invitation(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. Read RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_my_home_experiences()
RETURNS TABLE (
  id           uuid,
  title        text,
  location_name        text,
  location_latitude    double precision,
  location_longitude   double precision,
  starts_at    timestamptz,
  ends_at      timestamptz,
  transform_at timestamptz,
  status       public.experience_status,
  purge_at     timestamptz,
  organizer_id uuid,
  am_organizer boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.location_name,
    e.location_latitude,
    e.location_longitude,
    e.starts_at,
    e.ends_at,
    e.transform_at,
    e.status,
    e.purge_at,
    e.organizer_id,
    (e.organizer_id = auth.uid())
  FROM public.experiences e
  JOIN public.experience_participants ep
    ON ep.experience_id = e.id
   AND ep.user_id = auth.uid()
  WHERE (
      (e.status = 'planned' AND e.transform_at > NOW())
      OR (e.status = 'cancelled' AND e.purge_at IS NOT NULL AND e.purge_at > NOW())
    )
  ORDER BY e.starts_at ASC, e.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_experience(p_id uuid)
RETURNS TABLE (
  id               uuid,
  title            text,
  description      text,
  location_name    text,
  location_latitude    double precision,
  location_longitude   double precision,
  starts_at        timestamptz,
  ends_at          timestamptz,
  transform_at     timestamptz,
  visibility       public.experience_visibility,
  status           public.experience_status,
  cancelled_at     timestamptz,
  purge_at         timestamptz,
  organizer_id     uuid,
  edit_info_policy public.memory_permission_policy,
  am_organizer     boolean,
  can_revive       boolean,
  created_at       timestamptz,
  updated_at       timestamptz
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
    e.created_at,
    e.updated_at
  FROM public.experiences e
  WHERE e.id = p_id
    AND public.is_experience_participant(p_id)
  LIMIT 1;
$$;

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
    AND public.is_experience_participant(p_experience_id)
  ORDER BY ep.joined_at ASC, ep.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_experience_participants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_experience_participants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_incoming_experience_invitations()
RETURNS TABLE (
  invitation_id   uuid,
  experience_id   uuid,
  experience_title text,
  starts_at       timestamptz,
  invited_by      uuid,
  inviter_username text,
  inviter_display_name text,
  created_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.experience_id,
    e.title,
    e.starts_at,
    i.invited_by,
    p.username,
    p.display_name,
    i.created_at
  FROM public.experience_invitations i
  JOIN public.experiences e ON e.id = i.experience_id
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.invitee_id = auth.uid()
    AND i.status = 'pending'
    AND e.status = 'planned'
    AND e.starts_at > NOW()
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_incoming_experience_invitations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_incoming_experience_invitations() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_experience_invitations(p_experience_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  invitee_id    uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  status        public.experience_invitation_status,
  created_at    timestamptz,
  responded_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.invitee_id,
    p.username,
    p.display_name,
    p.avatar_url,
    i.status,
    i.created_at,
    i.responded_at
  FROM public.experience_invitations i
  LEFT JOIN public.profiles p ON p.id = i.invitee_id
  WHERE i.experience_id = p_experience_id
    AND public.is_experience_participant(p_experience_id)
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_experience_invitations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_experience_invitations(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. create_experience — organizer participant + optional friend invites
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_experience(
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_starts_at            timestamptz,
  p_ends_at              timestamptz,
  p_location_latitude    double precision DEFAULT NULL,
  p_location_longitude   double precision DEFAULT NULL,
  p_invitee_ids          uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid;
  v_id       uuid;
  v_title    text;
  v_invitee  uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'dates required';
  END IF;

  IF p_starts_at < public.experience_min_starts_at() THEN
    RAISE EXCEPTION 'starts in past';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid dates';
  END IF;

  v_title := trim(p_title);
  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'invalid title';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 2000 THEN
    RAISE EXCEPTION 'invalid description';
  END IF;

  IF p_location_name IS NOT NULL AND char_length(trim(p_location_name)) > 200 THEN
    RAISE EXCEPTION 'invalid location name';
  END IF;

  IF (p_location_latitude IS NULL) <> (p_location_longitude IS NULL) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  IF p_location_latitude IS NOT NULL AND (
    p_location_latitude < -90 OR p_location_latitude > 90
    OR p_location_longitude < -180 OR p_location_longitude > 180
  ) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  INSERT INTO public.experiences (
    created_by,
    organizer_id,
    title,
    description,
    location_name,
    location_latitude,
    location_longitude,
    starts_at,
    ends_at,
    visibility,
    status,
    transform_at,
    edit_info_policy
  )
  VALUES (
    v_me,
    v_me,
    v_title,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_location_name), ''),
    p_location_latitude,
    p_location_longitude,
    p_starts_at,
    p_ends_at,
    'private',
    'planned',
    public.compute_experience_transform_at(p_ends_at),
    'all_participants'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.experience_participants (experience_id, user_id, role)
  VALUES (v_id, v_me, 'organizer');

  IF p_invitee_ids IS NOT NULL THEN
    FOREACH v_invitee IN ARRAY p_invitee_ids
    LOOP
      IF v_invitee IS DISTINCT FROM v_me THEN
        PERFORM public.insert_experience_invitation(
          v_id, v_invitee, v_me, NULL, true
        );
      END IF;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Invitation write RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_experience_invitation(
  p_experience_id uuid,
  p_invitee_id    uuid
)
RETURNS uuid
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
    SELECT 1 FROM public.experiences e
    WHERE e.id = p_experience_id AND e.organizer_id = v_me
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN public.insert_experience_invitation(
    p_experience_id, p_invitee_id, v_me, NULL, true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_experience_invitation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_experience_invitation(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_experience_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_row public.experience_invitations%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.experience_invitations i
  WHERE i.id = p_invitation_id
    AND i.invitee_id = v_me
    AND i.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_invites_allowed(v_row.experience_id) THEN
    RAISE EXCEPTION 'invites closed';
  END IF;

  UPDATE public.experience_invitations
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_invitation_id;

  INSERT INTO public.experience_participants (experience_id, user_id, role)
  VALUES (v_row.experience_id, v_me, 'participant')
  ON CONFLICT (experience_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_experience_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_experience_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_experience_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_row public.experience_invitations%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.experience_invitations i
  WHERE i.id = p_invitation_id
    AND i.invitee_id = v_me
    AND i.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.experience_invitations
  SET status = 'declined', responded_at = NOW()
  WHERE id = p_invitation_id;

  PERFORM public.record_experience_invite_decline(v_row.experience_id, v_me);
END;
$$;

REVOKE ALL ON FUNCTION public.decline_experience_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_experience_invitation(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Participation write RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_experience_leadership(
  p_experience_id     uuid,
  p_new_organizer_id  uuid
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
    SELECT 1 FROM public.experiences e
    WHERE e.id = p_experience_id AND e.organizer_id = v_me
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, p_new_organizer_id) THEN
    RAISE EXCEPTION 'invalid leader';
  END IF;

  UPDATE public.experiences
  SET organizer_id = p_new_organizer_id
  WHERE id = p_experience_id;

  UPDATE public.experience_participants
  SET role = 'participant'
  WHERE experience_id = p_experience_id;

  UPDATE public.experience_participants
  SET role = 'organizer'
  WHERE experience_id = p_experience_id
    AND user_id = p_new_organizer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_experience_leadership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_experience_leadership(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_experience(
  p_id                uuid,
  p_new_organizer_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me           uuid;
  v_org          uuid;
  v_other_active integer;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT e.organizer_id INTO v_org
  FROM public.experiences e
  WHERE e.id = p_id
  FOR UPDATE;

  SELECT COUNT(*) INTO v_other_active
  FROM public.experience_participants ep
  WHERE ep.experience_id = p_id
    AND ep.user_id <> v_me;

  IF v_org = v_me AND v_other_active > 0 THEN
    IF p_new_organizer_id IS NULL THEN
      RAISE EXCEPTION 'leader required';
    END IF;
    PERFORM public.transfer_experience_leadership(p_id, p_new_organizer_id);
  END IF;

  DELETE FROM public.experience_participants
  WHERE experience_id = p_id AND user_id = v_me;

  PERFORM public.purge_experience_if_orphaned(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_experience(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_experience(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_experience_participant(
  p_experience_id uuid,
  p_user_id       uuid
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
    SELECT 1 FROM public.experiences e
    WHERE e.id = p_experience_id AND e.organizer_id = v_me
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_user_id = v_me THEN
    RAISE EXCEPTION 'use leave';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, p_user_id) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  DELETE FROM public.experience_participants
  WHERE experience_id = p_experience_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_experience_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_experience_participant(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision, uuid[]) TO authenticated;
