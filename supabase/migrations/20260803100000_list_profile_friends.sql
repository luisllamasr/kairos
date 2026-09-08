-- Privacy v1 follow-up: public-profile friend list (docs/PROJECT.md §6).
--
-- Additive only -- no changes to any existing Privacy v1 object. Exposes a
-- given profile's friend list to exactly the two audiences the locked model
-- grants it to: the owner themselves, and confirmed friends of the owner
-- (reuses the `are_friends` predicate from 20260802100000_privacy_v1_schema_
-- and_rpcs.sql -- one canonical place this check is defined). Everyone else
-- gets an empty result, not an error -- same fail-closed-but-quiet shape as
-- list_profile_memories.
--
-- SECURITY DEFINER is required (unlike list_friends(), which is INVOKER):
-- list_friends() only ever reads the caller's own friendships, which RLS
-- ("friendships_select_own") already permits. This RPC reads the *owner's*
-- friendships when the caller is a friend rather than the owner, which that
-- same RLS policy would block for a plain SECURITY INVOKER function.

CREATE OR REPLACE FUNCTION public.list_profile_friends(p_username text)
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
  )
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.friendships f
  JOIN owner ON owner.id = f.user_low_id OR owner.id = f.user_high_id
  JOIN public.profiles p
    ON p.id = CASE
      WHEN f.user_low_id = owner.id THEN f.user_high_id
      ELSE f.user_low_id
    END
  WHERE f.status = 'accepted'
    AND p.username IS NOT NULL
    AND (owner.id = auth.uid() OR public.are_friends(owner.id, auth.uid()))
  ORDER BY COALESCE(f.responded_at, f.created_at) DESC, p.username ASC;
$$;

REVOKE ALL ON FUNCTION public.list_profile_friends(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_profile_friends(text) TO authenticated;
