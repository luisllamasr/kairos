-- Invitation / suggestion polish:
-- 1. Batch invite + batch suggest (best-effort per friend)
-- 2. Leader withdrawal of a pending invitation (same invalidation family as cancel)
-- 3. Author withdrawal of a pending suggestion (silent; friend never contacted)
--
-- Single-friend send_experience_invitation / suggest_experience_invite stay as-is.

-- -----------------------------------------------------------------------------
-- 1. Batch send invitations
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_experience_invitations(
  p_experience_id uuid,
  p_invitee_ids   uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        uuid;
  v_invitee   uuid;
  v_id        uuid;
  v_sent      jsonb := '[]'::jsonb;
  v_failures  jsonb := '[]'::jsonb;
  v_ids       uuid[];
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

  IF p_invitee_ids IS NULL OR cardinality(p_invitee_ids) = 0 THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_invitee_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  FOREACH v_invitee IN ARRAY v_ids
  LOOP
    BEGIN
      IF v_invitee = v_me THEN
        RAISE EXCEPTION 'invalid user';
      END IF;

      v_id := public.insert_experience_invitation(
        p_experience_id, v_invitee, v_me, NULL, true
      );

      PERFORM public.enqueue_notification(
        v_invitee,
        'experience_invitation_received',
        'experience',
        p_experience_id,
        v_me,
        jsonb_build_object('invitation_id', v_id)
      );

      v_sent := v_sent || jsonb_build_array(v_invitee);
    EXCEPTION
      WHEN OTHERS THEN
        v_failures := v_failures || jsonb_build_array(
          jsonb_build_object('user_id', v_invitee, 'error', SQLERRM)
        );
    END;
  END LOOP;

  RETURN jsonb_build_object('sent', v_sent, 'failures', v_failures);
END;
$$;

REVOKE ALL ON FUNCTION public.send_experience_invitations(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_experience_invitations(uuid, uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Batch suggest invites
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.suggest_experience_invites(
  p_experience_id       uuid,
  p_suggested_user_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid;
  v_user     uuid;
  v_id       uuid;
  v_org      uuid;
  v_sent     jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_ids      uuid[];
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

  IF p_suggested_user_ids IS NULL OR cardinality(p_suggested_user_ids) = 0 THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_suggested_user_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  SELECT e.organizer_id INTO v_org
  FROM public.experiences e
  WHERE e.id = p_experience_id;

  FOREACH v_user IN ARRAY v_ids
  LOOP
    BEGIN
      IF v_user = v_me THEN
        RAISE EXCEPTION 'invalid user';
      END IF;

      IF public.is_experience_participant(p_experience_id, v_user) THEN
        RAISE EXCEPTION 'already participant';
      END IF;

      IF NOT public.are_accepted_friends(v_me, v_user) THEN
        RAISE EXCEPTION 'not friends';
      END IF;

      IF public.is_experience_invite_blocked(p_experience_id, v_user) THEN
        RAISE EXCEPTION 'invite blocked';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.experience_invitations i
        WHERE i.experience_id = p_experience_id
          AND i.invitee_id = v_user
          AND i.status = 'pending'
      ) THEN
        RAISE EXCEPTION 'invite pending';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.experience_invite_suggestions s
        WHERE s.experience_id = p_experience_id
          AND s.suggested_user_id = v_user
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
        v_user,
        'pending'
      )
      RETURNING id INTO v_id;

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

      v_sent := v_sent || jsonb_build_array(v_user);
    EXCEPTION
      WHEN OTHERS THEN
        v_failures := v_failures || jsonb_build_array(
          jsonb_build_object('user_id', v_user, 'error', SQLERRM)
        );
    END;
  END LOOP;

  RETURN jsonb_build_object('sent', v_sent, 'failures', v_failures);
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_experience_invites(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_experience_invites(uuid, uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Withdraw pending invitation (leader)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.withdraw_experience_invitation(
  p_invitation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid;
  v_row public.experience_invitations%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.experience_invitations i
  WHERE i.id = p_invitation_id
    AND i.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experiences e
    WHERE e.id = v_row.experience_id
      AND e.organizer_id = v_me
      AND e.status = 'planned'
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Same invalidation family as plan cancel: drop the offer + inbox row.
  -- Do not count as a decline (3-strike rule only applies to invitee declines).
  PERFORM public.purge_experience_invitation_notifications(
    v_row.experience_id,
    v_row.invitee_id
  );

  DELETE FROM public.experience_invitations
  WHERE id = p_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_experience_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_experience_invitation(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Withdraw pending suggestion (author)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.withdraw_experience_invite_suggestion(
  p_suggestion_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid;
  v_row public.experience_invite_suggestions%ROWTYPE;
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

  IF v_row.suggested_by <> v_me THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT public.is_experience_participant(v_row.experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  DELETE FROM public.notifications n
  WHERE n.entity_type = 'experience'
    AND n.entity_id = v_row.experience_id
    AND n.type = 'experience_invite_suggestion_received'
    AND n.payload->>'suggestion_id' = p_suggestion_id::text;

  DELETE FROM public.experience_invite_suggestions
  WHERE id = p_suggestion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_experience_invite_suggestion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_experience_invite_suggestion(uuid) TO authenticated;
