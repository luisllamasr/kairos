-- Experience lifecycle: transform at ends_at; freeze plan information,
-- cancellation, and leader-remove once starts_at has passed.
--
-- Product (all plans, private and public):
--   • Before starts_at: leader may edit plan information and cancel.
--   • From starts_at until ends_at: plan information is locked; cancellation
--     is not allowed; the leader may not remove participants.
--   • Chat (including chat_policy), leave, mute, and leadership transfer stay
--     available while the experience row exists (existing rules).
--   • At ends_at the plan is logically eligible to become a memory.
--     transform_due_experiences (cron every 15 min), transform_my_due_experiences
--     (Home / Profile / memories list), and ensure_experience_transformed
--     (detail / chat) still perform the actual DELETE/INSERT — processing may
--     lag the logical boundary by up to one cron interval if nobody has the
--     app open.
--
-- The previous ends_at + 3 hours grace was a documented placeholder for
-- live-window photo capture that was never built (photos live on memories).
-- Delayed in-plan photo reveal is a separate future feature, not this patch.
--
-- edit_info_policy remains on the row and is still copied into memories at
-- transform. Experience authorization for edit_info is now organizer-only and
-- ignores that column. set_experience_edit_policy is unchanged.
--
-- Not in this migration: public plans / discovery / join requests.

-- -----------------------------------------------------------------------------
-- 1. transform_at = ends_at
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_experience_transform_at(p_ends_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_ends_at;
$$;

COMMENT ON FUNCTION public.compute_experience_transform_at(timestamptz) IS
  'Logical memory-eligibility timestamp. Equals ends_at; cron/lazy RPCs may run later.';

UPDATE public.experiences
SET transform_at = ends_at
WHERE status = 'planned'
  AND transform_at IS DISTINCT FROM ends_at;

-- -----------------------------------------------------------------------------
-- 2. experience_user_can('edit_info'): leader, before starts_at
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.experience_user_can(
  p_experience_id uuid,
  p_capability  text,
  p_user_id     uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp public.experiences%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, p_user_id) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_exp
  FROM public.experiences e
  WHERE e.id = p_experience_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  CASE p_capability
    WHEN 'edit_info' THEN
      RETURN v_exp.status = 'planned'
        AND v_exp.starts_at > NOW()
        AND v_exp.organizer_id = p_user_id;

    WHEN 'set_edit_policy' THEN
      RETURN v_exp.status IN ('planned', 'cancelled')
        AND v_exp.organizer_id = p_user_id;

    WHEN 'chat_read' THEN
      RETURN v_exp.status IN ('planned', 'cancelled');

    WHEN 'chat_write' THEN
      RETURN v_exp.status IN ('planned', 'cancelled')
        AND (
          v_exp.chat_policy = 'all_participants'
          OR v_exp.organizer_id = p_user_id
        );

    WHEN 'chat_react' THEN
      RETURN v_exp.status IN ('planned', 'cancelled');

    WHEN 'set_chat_policy' THEN
      RETURN v_exp.status IN ('planned', 'cancelled')
        AND v_exp.organizer_id = p_user_id;

    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. cancel_experience: organizer, planned, starts_at still in the future
-- -----------------------------------------------------------------------------

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
    AND status = 'planned'
    AND starts_at > NOW();

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

-- -----------------------------------------------------------------------------
-- 4. remove_experience_participant: same start gate; transfer is unchanged
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_experience_participant(
  p_experience_id uuid,
  p_user_id uuid
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
      AND e.starts_at > NOW()
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

  PERFORM public.clear_experience_invite_suggestions_by_author(p_experience_id, p_user_id);

  DELETE FROM public.experience_participants
  WHERE experience_id = p_experience_id AND user_id = p_user_id;
END;
$$;
