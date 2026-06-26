-- Migration: invitation read path + M14 social row lifecycle
--
-- 1. Pending invitees can read experience rows (fixes list_incoming_experience_invitations).
-- 2. Invitations/suggestions are DELETE-on-resolve (no historical status rows).
-- 3. Experience-scoped notifications are purged when invites close or experience ends.

-- -----------------------------------------------------------------------------
-- 1. Access helpers + RLS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_pending_experience_invitee(
  p_experience_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.experience_invitations i
    WHERE i.experience_id = p_experience_id
      AND i.invitee_id = p_user_id
      AND i.status = 'pending'
  );
$$;

REVOKE ALL ON FUNCTION public.is_pending_experience_invitee(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_pending_experience_invitee(uuid, uuid) TO authenticated;

CREATE POLICY "experiences_select_pending_invitee"
  ON public.experiences
  FOR SELECT
  TO authenticated
  USING (public.is_pending_experience_invitee(id));

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
    AND (
      public.is_experience_participant(p_id)
      OR public.is_pending_experience_invitee(p_id)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_experience(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Notification purge helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_entity_notifications(
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.notifications n
  WHERE n.entity_type = p_entity_type
    AND n.entity_id = p_entity_id;
$$;

REVOKE ALL ON FUNCTION public.purge_entity_notifications(text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.purge_experience_invitation_notifications(
  p_experience_id uuid,
  p_invitee_id    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.notifications n
  WHERE n.entity_type = 'experience'
    AND n.entity_id = p_experience_id
    AND n.type = 'experience_invitation_received'
    AND (p_invitee_id IS NULL OR n.recipient_id = p_invitee_id);
$$;

REVOKE ALL ON FUNCTION public.purge_experience_invitation_notifications(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.maintain_stale_notifications(
  p_read_retention_days integer DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.notifications n
  WHERE n.read_at IS NOT NULL
    AND n.read_at < NOW() - make_interval(days => GREATEST(COALESCE(p_read_retention_days, 90), 1));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_stale_notifications(integer) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. Pending social row cleanup (DELETE, not status tombstones)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_experience_pending_invites(p_experience_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_experience_invitation_notifications(p_experience_id, NULL);

  DELETE FROM public.experience_invitations
  WHERE experience_id = p_experience_id
    AND status = 'pending';

  DELETE FROM public.experience_invite_suggestions
  WHERE experience_id = p_experience_id
    AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_experience_pending_invites(uuid) FROM PUBLIC;

-- Remove resolved historical rows from before DELETE-on-resolve policy.
DELETE FROM public.experience_invitations
WHERE status <> 'pending';

DELETE FROM public.experience_invite_suggestions
WHERE status <> 'pending';

-- -----------------------------------------------------------------------------
-- 4. Invitation respond RPCs (261400 bodies + DELETE lifecycle)
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

  INSERT INTO public.experience_participants (experience_id, user_id, role)
  VALUES (v_row.experience_id, v_me, 'participant')
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

CREATE OR REPLACE FUNCTION public.decline_experience_invitation(p_invitation_id uuid)
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

  PERFORM public.record_experience_invite_decline(v_row.experience_id, v_me);

  DELETE FROM public.experience_invitations
  WHERE id = p_invitation_id;

  PERFORM public.purge_experience_invitation_notifications(v_row.experience_id, v_me);

  SELECT e.organizer_id INTO v_org
  FROM public.experiences e WHERE e.id = v_row.experience_id;

  IF v_org IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      v_org,
      'experience_invitation_declined',
      'experience',
      v_row.experience_id,
      v_me,
      jsonb_build_object('invitation_id', p_invitation_id)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_experience_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_experience_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_experience_invite_suggestion(
  p_suggestion_id uuid,
  p_approve       boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_row public.experience_invite_suggestions%ROWTYPE;
  v_invite_id uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.experience_invite_suggestions s
  WHERE s.id = p_suggestion_id
    AND s.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experiences e
    WHERE e.id = v_row.experience_id AND e.organizer_id = v_me
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT p_approve THEN
    DELETE FROM public.experience_invite_suggestions
    WHERE id = p_suggestion_id;

    PERFORM public.enqueue_notification(
      v_row.suggested_by,
      'experience_invite_suggestion_rejected',
      'experience',
      v_row.experience_id,
      v_me,
      jsonb_build_object('suggestion_id', p_suggestion_id)
    );
    RETURN;
  END IF;

  IF NOT public.experience_invites_allowed(v_row.experience_id) THEN
    RAISE EXCEPTION 'invites closed';
  END IF;

  v_invite_id := public.insert_experience_invitation(
    v_row.experience_id,
    v_row.suggested_user_id,
    v_me,
    p_suggestion_id,
    false
  );

  DELETE FROM public.experience_invite_suggestions
  WHERE id = p_suggestion_id;

  PERFORM public.enqueue_notification(
    v_row.suggested_by,
    'experience_invite_suggestion_approved',
    'experience',
    v_row.experience_id,
    v_me,
    jsonb_build_object('suggestion_id', p_suggestion_id, 'invitation_id', v_invite_id)
  );

  PERFORM public.enqueue_notification(
    v_row.suggested_user_id,
    'experience_invitation_received',
    'experience',
    v_row.experience_id,
    v_me,
    jsonb_build_object('invitation_id', v_invite_id, 'from_suggestion', true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_experience_invite_suggestion(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_experience_invite_suggestion(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Experience end — purge experience-scoped notifications
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_experience(p_id uuid)
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
    WHERE e.id = p_id
      AND e.organizer_id = v_me
      AND (
        e.status = 'planned'
        OR (e.status = 'cancelled' AND e.purge_at IS NOT NULL AND e.purge_at > NOW())
      )
  ) THEN
    RAISE EXCEPTION 'not deletable';
  END IF;

  PERFORM public.purge_entity_notifications('experience', p_id);

  DELETE FROM public.experiences
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_experience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_experience(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transform_experience_to_memory(p_experience_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp         public.experiences%ROWTYPE;
  v_memory_id   uuid;
  v_now         timestamptz := NOW();
  v_part        record;
  v_uid         uuid;
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

  FOR v_part IN
    SELECT ep.user_id, ep.role, ep.joined_at
    FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
    ORDER BY ep.joined_at ASC
  LOOP
    INSERT INTO public.memory_participants (memory_id, user_id, role, joined_at)
    VALUES (
      v_memory_id,
      v_part.user_id,
      CASE
        WHEN v_part.user_id = v_exp.organizer_id THEN 'organizer'::public.memory_participant_role
        ELSE v_part.role
      END,
      v_part.joined_at
    );
  END LOOP;

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
