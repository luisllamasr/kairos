-- Phase 1: leadership SSOT — organizer_id / leader_id only.
-- Drop duplicated participant role columns and memory_participant_role enum.

-- -----------------------------------------------------------------------------
-- 1. List RPCs (return shape changes)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.list_experience_participants(uuid);

CREATE OR REPLACE FUNCTION public.list_experience_participants(p_experience_id uuid)
RETURNS TABLE (
  participant_id uuid,
  user_id        uuid,
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

DROP FUNCTION IF EXISTS public.list_memory_participants(uuid);

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
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.list_memory_participants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_memory_participants(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Write RPCs — stop writing participant role
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_experience_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_row public.experience_invitations%ROWTYPE;
  v_org uuid;
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

  INSERT INTO public.experience_participants (experience_id, user_id)
  VALUES (v_row.experience_id, v_me)
  ON CONFLICT (experience_id, user_id) DO NOTHING;

  DELETE FROM public.experience_invitations
  WHERE id = p_invitation_id;

  PERFORM public.purge_experience_invitation_notifications(v_row.experience_id, v_me);

  SELECT e.organizer_id INTO v_org
  FROM public.experiences e WHERE e.id = v_row.experience_id;

  IF v_org IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      v_org,
      'experience_invitation_accepted',
      'experience',
      v_row.experience_id,
      v_me,
      jsonb_build_object('invitation_id', p_invitation_id)
    );
  END IF;

  IF v_row.invited_by IS DISTINCT FROM v_org AND v_row.invited_by IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      v_row.invited_by,
      'experience_invitation_accepted',
      'experience',
      v_row.experience_id,
      v_me,
      jsonb_build_object('invitation_id', p_invitation_id)
    );
  END IF;

  PERFORM public.notify_experience_participants(
    v_row.experience_id,
    'experience_participant_joined',
    v_me,
    '{}'::jsonb,
    v_me
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_experience_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_experience_invitation(uuid) TO authenticated;

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
  v_invite_id uuid;
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

  INSERT INTO public.experience_participants (experience_id, user_id)
  VALUES (v_id, v_me);

  IF p_invitee_ids IS NOT NULL THEN
    FOREACH v_invitee IN ARRAY p_invitee_ids
    LOOP
      IF v_invitee IS DISTINCT FROM v_me THEN
        v_invite_id := public.insert_experience_invitation(
          v_id, v_invitee, v_me, NULL, true
        );
        PERFORM public.enqueue_notification(
          v_invitee,
          'experience_invitation_received',
          'experience',
          v_id,
          v_me,
          jsonb_build_object('invitation_id', v_invite_id)
        );
      END IF;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_experience(text, text, text, timestamptz, timestamptz, double precision, double precision, uuid[]) TO authenticated;

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
    WHERE e.id = p_experience_id
      AND e.organizer_id = v_me
      AND e.status = 'planned'
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, p_new_organizer_id) THEN
    RAISE EXCEPTION 'invalid leader';
  END IF;

  UPDATE public.experiences
  SET organizer_id = p_new_organizer_id
  WHERE id = p_experience_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_experience_leadership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_experience_leadership(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revive_experience(p_id uuid)
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

  IF NOT public.is_experience_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.experiences
  SET
    status = 'planned',
    cancelled_at = NULL,
    purge_at = NULL,
    organizer_id = v_me
  WHERE id = p_id
    AND status = 'cancelled'
    AND starts_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not revivable';
  END IF;

  PERFORM public.notify_experience_participants(
    p_id,
    'experience_revived',
    v_me,
    '{}'::jsonb,
    v_me
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revive_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revive_experience(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transform_experience_to_memory(p_experience_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp       public.experiences%ROWTYPE;
  v_memory_id uuid;
  v_now       timestamptz := NOW();
  v_uid       uuid;
BEGIN
  SELECT * INTO v_exp
  FROM public.experiences e
  WHERE e.id = p_experience_id
    AND e.status = 'planned'
    AND e.transform_at <= v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.memories (
    source_experience_id,
    created_by,
    organizer_id_at_transform,
    leader_id,
    title,
    description,
    location_name,
    location_latitude,
    location_longitude,
    happened_starts_at,
    happened_ends_at,
    transformed_at,
    visibility,
    inspired_by_opportunity_id,
    edit_info_policy,
    add_media_policy,
    updated_by
  )
  VALUES (
    v_exp.id,
    v_exp.created_by,
    v_exp.organizer_id,
    v_exp.organizer_id,
    v_exp.title,
    v_exp.description,
    v_exp.location_name,
    v_exp.location_latitude,
    v_exp.location_longitude,
    v_exp.starts_at,
    v_exp.ends_at,
    v_now,
    v_exp.visibility,
    v_exp.inspired_by_opportunity_id,
    v_exp.edit_info_policy,
    'all_participants',
    v_exp.organizer_id
  )
  RETURNING id INTO v_memory_id;

  INSERT INTO public.memory_participants (memory_id, user_id, joined_at)
  SELECT v_memory_id, ep.user_id, ep.joined_at
  FROM public.experience_participants ep
  WHERE ep.experience_id = p_experience_id
  ORDER BY ep.joined_at ASC;

  FOR v_uid IN
    SELECT ep.user_id FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
  LOOP
    PERFORM public.enqueue_notification(
      v_uid,
      'memory_created',
      'memory',
      v_memory_id,
      NULL,
      jsonb_build_object('experience_id', p_experience_id)
    );
  END LOOP;

  PERFORM public.purge_entity_notifications('experience', p_experience_id);

  DELETE FROM public.experiences WHERE id = v_exp.id;

  RETURN v_memory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transform_experience_to_memory(uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. Drop duplicated columns and enum
-- -----------------------------------------------------------------------------

ALTER TABLE public.experience_participants
  DROP COLUMN role;

ALTER TABLE public.memory_participants
  DROP COLUMN role;

DROP TYPE public.memory_participant_role;
