-- Migration: shared experiences suggest-invite (milestone 14 — phase 4)

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

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_experience_invite(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_experience_invite(uuid, uuid) TO authenticated;

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
    RETURN;
  END IF;

  IF NOT public.experience_invites_allowed(v_row.experience_id) THEN
    RAISE EXCEPTION 'invites closed';
  END IF;

  UPDATE public.experience_invite_suggestions
  SET status = 'approved', reviewed_by = v_me, reviewed_at = NOW()
  WHERE id = p_suggestion_id;

  PERFORM public.insert_experience_invitation(
    v_row.experience_id,
    v_row.suggested_user_id,
    v_me,
    p_suggestion_id,
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_experience_invite_suggestion(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_experience_invite_suggestion(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_experience_invite_suggestions(p_experience_id uuid)
RETURNS TABLE (
  suggestion_id       uuid,
  suggested_by        uuid,
  suggester_username  text,
  suggester_display_name text,
  suggested_user_id   uuid,
  suggested_username  text,
  suggested_display_name text,
  status              public.experience_invite_suggestion_status,
  created_at          timestamptz,
  reviewed_at         timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.suggested_by,
    pb.username,
    pb.display_name,
    s.suggested_user_id,
    pt.username,
    pt.display_name,
    s.status,
    s.created_at,
    s.reviewed_at
  FROM public.experience_invite_suggestions s
  LEFT JOIN public.profiles pb ON pb.id = s.suggested_by
  LEFT JOIN public.profiles pt ON pt.id = s.suggested_user_id
  WHERE s.experience_id = p_experience_id
    AND public.is_experience_participant(p_experience_id)
  ORDER BY s.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_experience_invite_suggestions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_experience_invite_suggestions(uuid) TO authenticated;
