-- Suggestion / invitation lifecycle hardening (audit follow-up).
--
-- Bugs observed in testing:
-- 1. After a suggestion was approved into a pending invitation, participants
--    could suggest the same friend again (server only blocked duplicate
--    *pending suggestions*, not pending invitations).
-- 2. Approving that second suggestion then failed with "invite pending",
--    leaving a stuck pending suggestion alongside the invitation.
-- 3. A new leader could still see suggestions they had submitted as a
--    participant — those should resolve when leadership transfers.

-- -----------------------------------------------------------------------------
-- 1. Shared invite insert — also clear any pending suggestions for the invitee
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

  -- Invitation supersedes any pending suggestion for this person (approved
  -- path, direct leader invite, or leadership auto-resolve below).
  DELETE FROM public.experience_invite_suggestions
  WHERE experience_id = p_experience_id
    AND suggested_user_id = p_invitee_id
    AND status = 'pending';

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_experience_invitation(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. Suggest — also refuse when an invitation is already pending
-- -----------------------------------------------------------------------------

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
    SELECT 1 FROM public.experience_invitations i
    WHERE i.experience_id = p_experience_id
      AND i.invitee_id = p_suggested_user_id
      AND i.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'invite pending';
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

REVOKE ALL ON FUNCTION public.suggest_experience_invite(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_experience_invite(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Leadership transfer — auto-resolve the new leader's own suggestions
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
  v_sug public.experience_invite_suggestions%ROWTYPE;
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

  -- Suggestions the new leader submitted as a participant no longer need
  -- self-approval: convert to invitations when possible, always clear the row.
  FOR v_sug IN
    SELECT *
    FROM public.experience_invite_suggestions s
    WHERE s.experience_id = p_experience_id
      AND s.suggested_by = p_new_organizer_id
      AND s.status = 'pending'
    FOR UPDATE
  LOOP
    BEGIN
      IF public.experience_invites_allowed(p_experience_id)
         AND NOT public.is_experience_participant(p_experience_id, v_sug.suggested_user_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.experience_invitations i
           WHERE i.experience_id = p_experience_id
             AND i.invitee_id = v_sug.suggested_user_id
             AND i.status = 'pending'
         )
      THEN
        PERFORM public.insert_experience_invitation(
          p_experience_id,
          v_sug.suggested_user_id,
          p_new_organizer_id,
          v_sug.id,
          false
        );
      ELSE
        DELETE FROM public.experience_invite_suggestions
        WHERE id = v_sug.id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        DELETE FROM public.experience_invite_suggestions
        WHERE id = v_sug.id;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_experience_leadership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_experience_leadership(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. One-shot repair — stuck suggestion + pending invite pairs from the bug above
-- -----------------------------------------------------------------------------

DELETE FROM public.experience_invite_suggestions s
WHERE s.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.experience_invitations i
    WHERE i.experience_id = s.experience_id
      AND i.invitee_id = s.suggested_user_id
      AND i.status = 'pending'
  );
