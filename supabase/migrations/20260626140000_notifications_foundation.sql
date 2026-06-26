-- Migration: notifications foundation (milestone 14 — phase 5)
--
-- Notification rows, per-entity mute, enqueue helper, list/mark-read RPCs.
-- M19 adds inbox UI, push, and advanced preferences.

-- -----------------------------------------------------------------------------
-- 1. Memory participant mute column (experience column added in M14 schema)
-- -----------------------------------------------------------------------------

ALTER TABLE public.memory_participants
  ADD COLUMN IF NOT EXISTS notifications_muted BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 2. Notifications table
-- -----------------------------------------------------------------------------

CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID NOT NULL,
  type          TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  actor_id      UUID,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notifications_recipient_fkey
    FOREIGN KEY (recipient_id) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT notifications_actor_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE INDEX notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX notifications_recipient_unread_idx
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. Enqueue helper (respects per-entity mute; skips self-notify)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_recipient_id uuid,
  p_type         text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_actor_id     uuid DEFAULT NULL,
  p_payload      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient_id IS NULL THEN
    RETURN;
  END IF;

  IF p_actor_id IS NOT NULL AND p_recipient_id = p_actor_id THEN
    RETURN;
  END IF;

  IF p_entity_type = 'experience' AND p_entity_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.experience_participants ep
      WHERE ep.experience_id = p_entity_id
        AND ep.user_id = p_recipient_id
        AND ep.notifications_muted
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF p_entity_type = 'memory' AND p_entity_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.memory_participants mp
      WHERE mp.memory_id = p_entity_id
        AND mp.user_id = p_recipient_id
        AND mp.left_at IS NULL
        AND mp.notifications_muted
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    type,
    entity_type,
    entity_id,
    actor_id,
    payload
  )
  VALUES (
    p_recipient_id,
    p_type,
    p_entity_type,
    p_entity_id,
    p_actor_id,
    COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, uuid, uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.notify_experience_participants(
  p_experience_id uuid,
  p_type          text,
  p_actor_id      uuid DEFAULT NULL,
  p_payload       jsonb DEFAULT '{}'::jsonb,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  FOR v_uid IN
    SELECT ep.user_id
    FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
      AND (p_exclude_user_id IS NULL OR ep.user_id <> p_exclude_user_id)
  LOOP
    PERFORM public.enqueue_notification(
      v_uid, p_type, 'experience', p_experience_id, p_actor_id, p_payload
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_experience_participants(uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 4. Mute + read RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_experience_notifications_muted(
  p_experience_id uuid,
  p_muted         boolean
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

  UPDATE public.experience_participants
  SET notifications_muted = p_muted
  WHERE experience_id = p_experience_id
    AND user_id = v_me;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_experience_notifications_muted(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_experience_notifications_muted(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_memory_notifications_muted(
  p_memory_id uuid,
  p_muted     boolean
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

  UPDATE public.memory_participants
  SET notifications_muted = p_muted
  WHERE memory_id = p_memory_id
    AND user_id = v_me
    AND left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_memory_notifications_muted(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_memory_notifications_muted(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_notifications(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id          uuid,
  type        text,
  entity_type text,
  entity_id   uuid,
  actor_id    uuid,
  payload     jsonb,
  read_at     timestamptz,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    n.id,
    n.type,
    n.entity_type,
    n.entity_id,
    n.actor_id,
    n.payload,
    n.read_at,
    n.created_at
  FROM public.notifications n
  WHERE n.recipient_id = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
$$;

REVOKE ALL ON FUNCTION public.list_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_notifications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.notifications n
  WHERE n.recipient_id = auth.uid()
    AND n.read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.count_unread_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Wire notifications into invitation + lifecycle RPCs
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
  v_id uuid;
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

  v_id := public.insert_experience_invitation(
    p_experience_id, p_invitee_id, v_me, NULL, true
  );

  PERFORM public.enqueue_notification(
    p_invitee_id,
    'experience_invitation_received',
    'experience',
    p_experience_id,
    v_me,
    jsonb_build_object('invitation_id', v_id)
  );

  RETURN v_id;
END;
$$;

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

  UPDATE public.experience_invitations
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_invitation_id;

  INSERT INTO public.experience_participants (experience_id, user_id, role)
  VALUES (v_row.experience_id, v_me, 'participant')
  ON CONFLICT (experience_id, user_id) DO NOTHING;

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

  UPDATE public.experience_invitations
  SET status = 'declined', responded_at = NOW()
  WHERE id = p_invitation_id;

  PERFORM public.record_experience_invite_decline(v_row.experience_id, v_me);

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

CREATE OR REPLACE FUNCTION public.suggest_experience_invite(
  p_experience_id       uuid,
  p_suggested_user_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_id uuid;
  v_org uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_invites_allowed(p_experience_id) THEN
    RAISE EXCEPTION 'invites closed';
  END IF;

  IF p_suggested_user_id = v_me THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  IF public.is_experience_participant(p_experience_id, p_suggested_user_id) THEN
    RAISE EXCEPTION 'already participant';
  END IF;

  IF NOT public.are_accepted_friends(v_me, p_suggested_user_id) THEN
    RAISE EXCEPTION 'not friends';
  END IF;

  IF public.is_experience_invite_blocked(p_experience_id, p_suggested_user_id) THEN
    RAISE EXCEPTION 'invite blocked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.experience_invite_suggestions s
    WHERE s.experience_id = p_experience_id
      AND s.suggested_user_id = p_suggested_user_id
      AND s.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'suggestion pending';
  END IF;

  INSERT INTO public.experience_invite_suggestions (
    experience_id,
    suggested_by,
    suggested_user_id,
    status
  )
  VALUES (
    p_experience_id,
    v_me,
    p_suggested_user_id,
    'pending'
  )
  RETURNING id INTO v_id;

  SELECT e.organizer_id INTO v_org
  FROM public.experiences e WHERE e.id = p_experience_id;

  IF v_org IS NOT NULL AND v_org <> v_me THEN
    PERFORM public.enqueue_notification(
      v_org,
      'experience_invite_suggestion_received',
      'experience',
      p_experience_id,
      v_me,
      jsonb_build_object('suggestion_id', v_id)
    );
  END IF;

  RETURN v_id;
END;
$$;

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
    UPDATE public.experience_invite_suggestions
    SET status = 'rejected', reviewed_by = v_me, reviewed_at = NOW()
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

  UPDATE public.experience_invite_suggestions
  SET status = 'approved', reviewed_by = v_me, reviewed_at = NOW()
  WHERE id = p_suggestion_id;

  v_invite_id := public.insert_experience_invitation(
    v_row.experience_id,
    v_row.suggested_user_id,
    v_me,
    p_suggestion_id,
    false
  );

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

  PERFORM public.notify_experience_participants(
    p_id,
    'experience_participant_left',
    v_me,
    '{}'::jsonb,
    v_me
  );

  DELETE FROM public.experience_participants
  WHERE experience_id = p_id AND user_id = v_me;

  PERFORM public.purge_experience_if_orphaned(p_id);
END;
$$;

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

  PERFORM public.enqueue_notification(
    p_user_id,
    'experience_participant_removed',
    'experience',
    p_experience_id,
    v_me,
    '{}'::jsonb
  );

  DELETE FROM public.experience_participants
  WHERE experience_id = p_experience_id AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_experience(p_id uuid)
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

  UPDATE public.experiences
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    purge_at = public.compute_experience_cancel_purge_at(ends_at)
  WHERE id = p_id
    AND organizer_id = v_me
    AND status = 'planned';

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.experiences e
      WHERE e.id = p_id AND e.organizer_id = v_me AND e.status = 'cancelled'
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'not cancellable';
  END IF;

  PERFORM public.cancel_experience_pending_invites(p_id);

  PERFORM public.notify_experience_participants(
    p_id,
    'experience_cancelled',
    v_me,
    '{}'::jsonb,
    v_me
  );
END;
$$;

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

  UPDATE public.experience_participants
  SET role = 'participant'
  WHERE experience_id = p_id;

  UPDATE public.experience_participants
  SET role = 'organizer'
  WHERE experience_id = p_id AND user_id = v_me;

  PERFORM public.notify_experience_participants(
    p_id,
    'experience_revived',
    v_me,
    '{}'::jsonb,
    v_me
  );
END;
$$;

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

  DELETE FROM public.experiences WHERE id = v_exp.id;

  RETURN v_memory_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_experience(
  p_id                   uuid,
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_starts_at            timestamptz,
  p_ends_at              timestamptz,
  p_location_latitude    double precision DEFAULT NULL,
  p_location_longitude   double precision DEFAULT NULL,
  p_expected_updated_at  timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid;
  v_title text;
  v_exp   public.experiences%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT * INTO v_exp FROM public.experiences e WHERE e.id = p_id FOR UPDATE;

  IF v_exp.status <> 'planned' OR v_exp.transform_at <= NOW() THEN
    RAISE EXCEPTION 'not updatable';
  END IF;

  IF v_exp.edit_info_policy = 'leader_only' AND v_exp.organizer_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_exp.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'conflict';
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

  UPDATE public.experiences
  SET
    title = v_title,
    description = NULLIF(trim(p_description), ''),
    location_name = NULLIF(trim(p_location_name), ''),
    location_latitude = p_location_latitude,
    location_longitude = p_location_longitude,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    transform_at = public.compute_experience_transform_at(p_ends_at),
    visibility = 'private'
  WHERE id = p_id;

  PERFORM public.notify_experience_participants(
    p_id,
    'experience_updated',
    v_me,
    jsonb_build_object('fields', 'content'),
    v_me
  );
END;
$$;

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

  INSERT INTO public.experience_participants (experience_id, user_id, role)
  VALUES (v_id, v_me, 'organizer');

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
