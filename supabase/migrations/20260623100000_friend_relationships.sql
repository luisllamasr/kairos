-- Migration: mutual friend relationships (milestone 11)
--
-- Product rules:
--   • Friendships are mutual — status 'accepted' means both users are friends.
--   • Pending requests are temporary; declining deletes the row (no declined status).
--   • Pending requests expire after 60 days (scheduled cleanup).
--   • Simultaneous requests auto-accept into friendship.
--   • Only discoverable profiles (username IS NOT NULL) can send/receive requests.
--   • No asymmetric follows — this table is the only relationship graph primitive.
--
-- Future trust signals (experiences, mutual friends) can query accepted rows;
-- avoid popularity metrics — no follower counts or ranking here.

-- -----------------------------------------------------------------------------
-- 1. Enum + table
-- -----------------------------------------------------------------------------

CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted');

CREATE TABLE public.friendships (
  user_low_id   UUID                     NOT NULL,
  user_high_id  UUID                     NOT NULL,
  status        public.friendship_status NOT NULL,
  initiated_by  UUID                     NOT NULL,
  created_at    TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,

  CONSTRAINT friendships_pkey
    PRIMARY KEY (user_low_id, user_high_id),

  CONSTRAINT friendships_user_low_fkey
    FOREIGN KEY (user_low_id)
    REFERENCES public.profiles (id)
    ON DELETE CASCADE,

  CONSTRAINT friendships_user_high_fkey
    FOREIGN KEY (user_high_id)
    REFERENCES public.profiles (id)
    ON DELETE CASCADE,

  CONSTRAINT friendships_initiated_by_fkey
    FOREIGN KEY (initiated_by)
    REFERENCES public.profiles (id)
    ON DELETE CASCADE,

  CONSTRAINT friendships_ordered_pair
    CHECK (user_low_id < user_high_id),

  CONSTRAINT friendships_initiator_in_pair
    CHECK (initiated_by = user_low_id OR initiated_by = user_high_id)
);

COMMENT ON TABLE public.friendships IS
  'Mutual friend relationships. One row per user pair (canonical UUID ordering).';

-- List friends / incoming requests / pair lookup
CREATE INDEX friendships_user_low_status_idx
  ON public.friendships (user_low_id, status);

CREATE INDEX friendships_user_high_status_idx
  ON public.friendships (user_high_id, status);

CREATE INDEX friendships_pending_created_idx
  ON public.friendships (created_at)
  WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- 2. Grants + RLS
-- -----------------------------------------------------------------------------

GRANT SELECT ON TABLE public.friendships TO authenticated;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select_own"
  ON public.friendships
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_low_id
    OR auth.uid() = user_high_id
  );

-- Writes go through SECURITY DEFINER RPCs only (no INSERT/UPDATE/DELETE grant).

-- -----------------------------------------------------------------------------
-- 3. Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_discoverable_profile_id(p_username text)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.username = lower(trim(ltrim(p_username, '@')))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_discoverable_profile_id(text) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 4. Read RPCs (SECURITY INVOKER)
-- -----------------------------------------------------------------------------

-- Return type adds relationship_status — CREATE OR REPLACE cannot change OUT params.
DROP FUNCTION IF EXISTS public.get_public_profile(text);

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  username              text,
  display_name          text,
  avatar_url            text,
  relationship_status   text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.username,
    p.display_name,
    p.avatar_url,
    COALESCE(
      (
        SELECT CASE
          WHEN f.status = 'accepted' THEN 'friends'
          WHEN f.initiated_by = auth.uid() THEN 'pending_outgoing'
          ELSE 'pending_incoming'
        END
        FROM public.friendships f
        WHERE f.user_low_id = LEAST(auth.uid(), p.id)
          AND f.user_high_id = GREATEST(auth.uid(), p.id)
      ),
      'none'
    ) AS relationship_status
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.username = lower(trim(ltrim(p_username, '@')))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_friends()
RETURNS TABLE (
  username     text,
  display_name text,
  avatar_url   text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE
      WHEN f.user_low_id = auth.uid() THEN f.user_high_id
      ELSE f.user_low_id
    END
  WHERE f.status = 'accepted'
    AND (f.user_low_id = auth.uid() OR f.user_high_id = auth.uid())
    AND p.username IS NOT NULL
  ORDER BY COALESCE(f.responded_at, f.created_at) DESC, p.username ASC;
$$;

REVOKE ALL ON FUNCTION public.list_friends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_friends() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_incoming_friend_requests()
RETURNS TABLE (
  username     text,
  display_name text,
  avatar_url   text,
  requested_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.username,
    p.display_name,
    p.avatar_url,
    f.created_at AS requested_at
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE
      WHEN f.user_low_id = auth.uid() THEN f.user_high_id
      ELSE f.user_low_id
    END
  WHERE f.status = 'pending'
    AND (f.user_low_id = auth.uid() OR f.user_high_id = auth.uid())
    AND f.initiated_by != auth.uid()
    AND p.username IS NOT NULL
  ORDER BY f.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_incoming_friend_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_incoming_friend_requests() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Write RPCs (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_friend_request(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID;
  v_target UUID;
  v_low    UUID;
  v_high   UUID;
  v_row    public.friendships%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_target := public.resolve_discoverable_profile_id(p_username);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF v_target = v_me THEN
    RAISE EXCEPTION 'cannot friend self';
  END IF;

  v_low  := LEAST(v_me, v_target);
  v_high := GREATEST(v_me, v_target);

  SELECT * INTO v_row
  FROM public.friendships f
  WHERE f.user_low_id = v_low
    AND f.user_high_id = v_high;

  IF FOUND THEN
    IF v_row.status = 'accepted' THEN
      RETURN;
    END IF;

    IF v_row.initiated_by = v_me THEN
      RETURN;
    END IF;

    -- Incoming pending exists — simultaneous request auto-accepts.
    UPDATE public.friendships
    SET status = 'accepted', responded_at = NOW()
    WHERE user_low_id = v_low
      AND user_high_id = v_high;
    RETURN;
  END IF;

  INSERT INTO public.friendships (user_low_id, user_high_id, status, initiated_by)
  VALUES (v_low, v_high, 'pending', v_me);
END;
$$;

REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID;
  v_target UUID;
  v_low    UUID;
  v_high   UUID;
  v_updated int;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_target := public.resolve_discoverable_profile_id(p_username);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF v_target = v_me THEN
    RAISE EXCEPTION 'cannot friend self';
  END IF;

  v_low  := LEAST(v_me, v_target);
  v_high := GREATEST(v_me, v_target);

  UPDATE public.friendships
  SET status = 'accepted', responded_at = NOW()
  WHERE user_low_id = v_low
    AND user_high_id = v_high
    AND status = 'pending'
    AND initiated_by != v_me;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Idempotent: already friends or no incoming request.
    IF EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_low_id = v_low
        AND f.user_high_id = v_high
        AND f.status = 'accepted'
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'no incoming request';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_friend_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_friend_request(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID;
  v_target UUID;
  v_low    UUID;
  v_high   UUID;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_target := public.resolve_discoverable_profile_id(p_username);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  v_low  := LEAST(v_me, v_target);
  v_high := GREATEST(v_me, v_target);

  DELETE FROM public.friendships
  WHERE user_low_id = v_low
    AND user_high_id = v_high
    AND status = 'pending'
    AND initiated_by != v_me;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_friend_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_friend_request(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID;
  v_target UUID;
  v_low    UUID;
  v_high   UUID;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_target := public.resolve_discoverable_profile_id(p_username);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  v_low  := LEAST(v_me, v_target);
  v_high := GREATEST(v_me, v_target);

  DELETE FROM public.friendships
  WHERE user_low_id = v_low
    AND user_high_id = v_high
    AND status = 'pending'
    AND initiated_by = v_me;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_friend_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_friend(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID;
  v_target UUID;
  v_low    UUID;
  v_high   UUID;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_target := public.resolve_discoverable_profile_id(p_username);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  v_low  := LEAST(v_me, v_target);
  v_high := GREATEST(v_me, v_target);

  DELETE FROM public.friendships
  WHERE user_low_id = v_low
    AND user_high_id = v_high
    AND status = 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_friend(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_friend(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Pending request expiry (60 days)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_stale_friend_requests()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.friendships
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '60 days';
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_friend_requests() FROM PUBLIC;

DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id
  FROM cron.job
  WHERE jobname = 'expire-stale-friend-requests-daily';

  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'expire-stale-friend-requests-daily',
  '45 3 * * *',
  $$SELECT public.expire_stale_friend_requests()$$
);
