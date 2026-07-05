-- Migration: experience chat RPCs (milestone 15.2)
--
-- All permission checks delegate to experience_user_can(...) — no duplicated policy logic.
-- send_experience_message locks parent experience FOR UPDATE (transform race; see PROJECT.md).

-- -----------------------------------------------------------------------------
-- 1. Permission helper — expanded capabilities + caller-only two-arg overload
-- -----------------------------------------------------------------------------

-- M15.1 created (uuid, text, uuid DEFAULT auth.uid()). PostgreSQL cannot
-- remove parameter defaults via CREATE OR REPLACE — drop first, then recreate.
DROP FUNCTION IF EXISTS public.experience_user_can(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.experience_user_can(uuid, text);

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
        AND v_exp.transform_at > NOW()
        AND (
          v_exp.edit_info_policy = 'all_participants'
          OR v_exp.organizer_id = p_user_id
        );

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

CREATE OR REPLACE FUNCTION public.experience_user_can(
  p_experience_id uuid,
  p_capability  text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.experience_user_can(p_experience_id, p_capability, auth.uid());
$$;

REVOKE ALL ON FUNCTION public.experience_user_can(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.experience_user_can(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.experience_user_can(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Extend get_experience — chat_policy + derived flags
-- -----------------------------------------------------------------------------

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
  chat_policy            public.memory_permission_policy,
  am_organizer           boolean,
  am_participant         boolean,
  pending_invitation_id  uuid,
  can_revive             boolean,
  can_send_chat          boolean,
  can_react_chat         boolean,
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
    e.chat_policy,
    (e.organizer_id = auth.uid()),
    (ep_me.user_id IS NOT NULL),
    inv.id,
    (ep_me.user_id IS NOT NULL AND e.status = 'cancelled' AND e.starts_at > NOW()),
    (ep_me.user_id IS NOT NULL AND public.experience_user_can(e.id, 'chat_write')),
    (ep_me.user_id IS NOT NULL AND public.experience_user_can(e.id, 'chat_react')),
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

-- -----------------------------------------------------------------------------
-- 3. Read RPC — messages with embedded reactions (INVOKER + RLS)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_experience_messages(
  p_experience_id uuid,
  p_before        timestamptz DEFAULT NULL,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE (
  id                  uuid,
  experience_id       uuid,
  author_id           uuid,
  body                text,
  created_at          timestamptz,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  reactions           jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.experience_id,
    m.author_id,
    m.body,
    m.created_at,
    p.username,
    p.display_name,
    p.avatar_url,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', r.user_id,
            'emoji', r.emoji,
            'created_at', r.created_at
          )
          ORDER BY r.created_at ASC, r.user_id ASC
        )
        FROM public.experience_message_reactions r
        WHERE r.message_id = m.id
      ),
      '[]'::jsonb
    )
  FROM public.experience_messages m
  LEFT JOIN public.profiles p ON p.id = m.author_id
  WHERE m.experience_id = p_experience_id
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.list_experience_messages(uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_experience_messages(uuid, timestamptz, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Write RPCs — all permission checks via experience_user_can
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_experience_message(
  p_experience_id uuid,
  p_body          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         uuid;
  v_body       text;
  v_message_id uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  PERFORM 1
  FROM public.experiences e
  WHERE e.id = p_experience_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_user_can(p_experience_id, 'chat_write', v_me) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_body := trim(p_body);
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'invalid body';
  END IF;

  INSERT INTO public.experience_messages (experience_id, author_id, body)
  VALUES (p_experience_id, v_me, v_body)
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_experience_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid;
  v_row public.experience_messages%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.experience_messages m
  WHERE m.id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.is_experience_participant(v_row.experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF v_row.author_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT public.experience_user_can(v_row.experience_id, 'chat_read', v_me) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.experience_messages WHERE id = p_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_experience_message_reaction(
  p_message_id uuid,
  p_emoji      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me             uuid;
  v_row            public.experience_messages%ROWTYPE;
  v_existing_emoji text;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.experience_messages m
  WHERE m.id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.is_experience_participant(v_row.experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_user_can(v_row.experience_id, 'chat_react', v_me) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_emoji IS NULL THEN
    DELETE FROM public.experience_message_reactions
    WHERE message_id = p_message_id
      AND user_id = v_me;
    RETURN;
  END IF;

  IF p_emoji NOT IN ('👍', '❤️', '😂', '😮', '😢', '🙏') THEN
    RAISE EXCEPTION 'invalid emoji';
  END IF;

  SELECT r.emoji INTO v_existing_emoji
  FROM public.experience_message_reactions r
  WHERE r.message_id = p_message_id
    AND r.user_id = v_me;

  IF FOUND AND v_existing_emoji = p_emoji THEN
    DELETE FROM public.experience_message_reactions
    WHERE message_id = p_message_id
      AND user_id = v_me;
    RETURN;
  END IF;

  INSERT INTO public.experience_message_reactions (message_id, user_id, emoji)
  VALUES (p_message_id, v_me, p_emoji)
  ON CONFLICT (message_id, user_id) DO UPDATE
  SET emoji = EXCLUDED.emoji,
      created_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_experience_chat_policy(
  p_experience_id uuid,
  p_policy        public.memory_permission_policy
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

  IF NOT public.is_experience_participant(p_experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_user_can(p_experience_id, 'set_chat_policy', v_me) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.experiences
  SET chat_policy = p_policy
  WHERE id = p_experience_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Refactor existing edit RPCs to delegate to experience_user_can
-- -----------------------------------------------------------------------------

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_user_can(p_id, 'edit_info', v_me) THEN
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
END;
$$;

CREATE OR REPLACE FUNCTION public.set_experience_edit_policy(
  p_experience_id uuid,
  p_policy        public.memory_permission_policy
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

  IF NOT public.is_experience_participant(p_experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_user_can(p_experience_id, 'set_edit_policy', v_me) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.experiences
  SET edit_info_policy = p_policy
  WHERE id = p_experience_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.send_experience_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_experience_message(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_experience_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_experience_message(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_experience_message_reaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_experience_message_reaction(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_experience_chat_policy(uuid, public.memory_permission_policy) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_experience_chat_policy(uuid, public.memory_permission_policy) TO authenticated;

REVOKE ALL ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_experience(uuid, text, text, text, timestamptz, timestamptz, double precision, double precision, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.set_experience_edit_policy(uuid, public.memory_permission_policy) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_experience_edit_policy(uuid, public.memory_permission_policy) TO authenticated;
