-- Migration: social user discovery (milestone 10)
--
-- Tightens profile visibility, adds username search index, and RPCs for
-- global user search + public profile load.
--
-- Product rules:
--   • Owner always reads own row (including incomplete onboarding state).
--   • Other users only see profiles with username set (onboarding complete).
--   • Incomplete profiles are never discoverable via search or public profile.

-- -----------------------------------------------------------------------------
-- 1. RLS — replace open read with owner-or-complete
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR username IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- 2. Index — prefix search on completed usernames
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS profiles_username_search_idx
  ON public.profiles (username text_pattern_ops)
  WHERE username IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. RPC — search_profiles
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_profiles(
  p_query text,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (
  username     text,
  display_name text,
  avatar_url   text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  normalized text;
  lim        int;
BEGIN
  normalized := lower(trim(p_query));
  normalized := ltrim(normalized, '@');

  IF length(normalized) < 3 THEN
    RETURN;
  END IF;

  lim := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);

  RETURN QUERY
  SELECT p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.id != auth.uid()
    AND p.username LIKE normalized || '%'
  ORDER BY p.username ASC
  LIMIT lim;
END;
$$;

REVOKE ALL ON FUNCTION public.search_profiles(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_profiles(text, int) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. RPC — get_public_profile
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
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
  SELECT p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.username = lower(trim(ltrim(p_username, '@')))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
