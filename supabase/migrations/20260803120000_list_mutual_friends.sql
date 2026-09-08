-- Privacy v1 follow-up: mutual-friends identity list (docs/PROJECT.md §6).
--
-- Additive only. get_public_profile's mutual_friend_count already computes
-- the correct intersection (as of 20260803110000); this RPC projects that
-- same intersection as rows instead of a count, so a viewer who is a
-- confirmed friend of the profile owner can open the identities behind the
-- number.
--
-- Non-friend boundary is enforced here, not just in the client: gated by
-- `public.are_friends(owner.id, auth.uid())`, so a non-friend (or the owner
-- viewing their own profile, where are_friends(x, x) is always false) gets
-- an empty result even if this RPC is called directly -- same fail-closed-
-- but-quiet shape as list_profile_memories / list_profile_friends.
--
-- SECURITY DEFINER for the same reason as list_profile_friends: it reads the
-- *owner's* friendships, which friendships_select_own RLS would not grant a
-- viewer who isn't a party to those specific rows.

CREATE OR REPLACE FUNCTION public.list_mutual_friends(p_username text)
RETURNS TABLE (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owner AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.username IS NOT NULL
      AND p.username = lower(trim(ltrim(p_username, '@')))
  ),
  owner_friends AS (
    SELECT CASE WHEN f.user_low_id = owner.id THEN f.user_high_id ELSE f.user_low_id END AS friend_id
    FROM public.friendships f
    JOIN owner ON owner.id = f.user_low_id OR owner.id = f.user_high_id
    WHERE f.status = 'accepted'
  ),
  viewer_friends AS (
    SELECT CASE WHEN f2.user_low_id = auth.uid() THEN f2.user_high_id ELSE f2.user_low_id END AS friend_id
    FROM public.friendships f2
    WHERE f2.status = 'accepted'
      AND (f2.user_low_id = auth.uid() OR f2.user_high_id = auth.uid())
  )
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url
  FROM owner_friends
  JOIN viewer_friends ON viewer_friends.friend_id = owner_friends.friend_id
  JOIN public.profiles p ON p.id = owner_friends.friend_id
  WHERE p.username IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM owner
      WHERE public.are_friends(owner.id, auth.uid())
    )
  ORDER BY p.username ASC;
$$;

REVOKE ALL ON FUNCTION public.list_mutual_friends(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_mutual_friends(text) TO authenticated;
