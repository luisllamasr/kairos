-- Fix: get_public_profile identity-stat aggregates were silently truncated
-- by the CALLER's own RLS (docs/PROJECT.md §6, Privacy v1).
--
-- Root cause: get_public_profile was left SECURITY INVOKER when Privacy v1
-- (20260802100000) extended it with friend_count / memory_count /
-- mutual_friend_count. Under INVOKER, every subquery inside the function is
-- filtered by the CALLER's RLS, not the profile owner's data:
--   * friendships_select_own restricts visible friendship rows to ones where
--     auth.uid() is a party. Combined with "owner is a party" (the query's
--     own filter), the only row that can pass both is the owner<->viewer
--     edge itself -- so friend_count degenerated to 0/1, and
--     mutual_friend_count's owner_friends subquery degenerated to at most
--     {auth.uid()}, which is never "in the viewer's own friend list" (you
--     can't be your own friend) -- so mutual_friend_count was always 0.
--   * memory_participants_select_fellow additionally requires the viewer to
--     be an active participant of the *same* memory, so memory_count only
--     counted memories shared with the viewer, not the owner's total.
--
-- None of the query logic was wrong -- only the security context. Every
-- sibling Privacy v1 RPC (list_profile_memories, get_public_memory,
-- list_public_memory_media, list_profile_friends) was authored SECURITY
-- DEFINER from the start for exactly this reason; get_public_profile now
-- matches them. relationship_status is unaffected: it only ever reads the
-- single friendship row between auth.uid() and the owner, which RLS always
-- lets the caller see regardless of INVOKER/DEFINER.
--
-- Safe to promote to DEFINER: profiles_select RLS is already
-- "auth.uid() = id OR username IS NOT NULL" (viewer-independent once
-- onboarding is complete), and this function's own `WHERE p.username IS NOT
-- NULL` clause already enforces the identical restriction explicitly -- so
-- DEFINER changes nothing about which profile row can be read, only lets the
-- aggregate subqueries see the full picture they were always meant to.
--
-- Return type is unchanged, so no DROP FUNCTION is needed here (unlike
-- 20260802100000, which had to change OUT params).

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  username             text,
  display_name         text,
  avatar_url           text,
  relationship_status  text,
  friend_count         integer,
  memory_count         integer,
  -- NULL when viewing your own profile (mutual-with-self is meaningless).
  mutual_friend_count  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    ) AS relationship_status,
    (
      SELECT COUNT(*)::integer
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (f.user_low_id = p.id OR f.user_high_id = p.id)
    ) AS friend_count,
    (
      SELECT COUNT(*)::integer
      FROM public.memory_participants mp
      WHERE mp.user_id = p.id
        AND mp.left_at IS NULL
    ) AS memory_count,
    CASE
      WHEN p.id = auth.uid() THEN NULL
      ELSE (
        SELECT COUNT(*)::integer
        FROM (
          SELECT CASE WHEN f.user_low_id = p.id THEN f.user_high_id ELSE f.user_low_id END AS friend_id
          FROM public.friendships f
          WHERE f.status = 'accepted'
            AND (f.user_low_id = p.id OR f.user_high_id = p.id)
        ) AS owner_friends
        WHERE owner_friends.friend_id IN (
          SELECT CASE WHEN f2.user_low_id = auth.uid() THEN f2.user_high_id ELSE f2.user_low_id END
          FROM public.friendships f2
          WHERE f2.status = 'accepted'
            AND (f2.user_low_id = auth.uid() OR f2.user_high_id = auth.uid())
        )
      )
    END AS mutual_friend_count
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.username = lower(trim(ltrim(p_username, '@')))
  LIMIT 1;
$$;

-- Explicit, not assumed: CREATE OR REPLACE preserves prior grants, but state
-- them again so this function's access is self-evident from this migration
-- alone, matching every other Privacy v1 RPC.
REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
