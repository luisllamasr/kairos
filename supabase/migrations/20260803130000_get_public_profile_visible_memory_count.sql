-- Revises the "memory count is always the true total" rule from Privacy v1
-- (docs/PROJECT.md §6) for the *public-profile* surface only.
--
-- Product decision (locked): on another person's public profile, the stat
-- must represent memories actually available to THIS viewer, not the
-- owner's raw total. The previous unconditional count:
--   * leaked the existence of hidden memories -- e.g. a `friends`-only
--     owner viewed by a non-friend showed a non-zero count next to zero
--     rendered rows, which itself reveals "this person has memories you
--     can't see";
--   * could disagree with list_profile_memories's row count whenever
--     profile_visible was false on some memories, since the old subquery
--     didn't check that column at all.
--
-- Fix: rename memory_count -> visible_memory_count and compute it with the
-- exact same predicate list_profile_memories uses (mp.left_at IS NULL AND
-- mp.profile_visible = true, gated by can_view_owner_memories_on_profile).
-- The rename (not just a formula fix) is deliberate -- the old name
-- "memory_count" reads as a true total, which this value now never is on
-- this RPC; keeping the two concepts named differently avoids a future
-- reader assuming this equals the owner's actual memory count. The owner's
-- own Profile tab (list_my_memories) is untouched and still returns every
-- memory they participate in regardless of these settings.
--
-- Return type changes -- CREATE OR REPLACE cannot rename an OUT column, so
-- this needs DROP FUNCTION first (same convention as 20260802100000's
-- get_public_profile change).

DROP FUNCTION IF EXISTS public.get_public_profile(text);

CREATE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  username              text,
  display_name          text,
  avatar_url             text,
  relationship_status    text,
  friend_count           integer,
  -- Renamed from memory_count: NOT the owner's total memory count. Exactly
  -- the number of rows list_profile_memories(p_username) would return to
  -- the same caller -- i.e. memories where this viewer is allowed to see
  -- them via the owner's own profile settings, and which the relevant
  -- participant has not hidden from their profile. Never the raw total.
  visible_memory_count   integer,
  -- NULL when viewing your own profile (mutual-with-self is meaningless).
  mutual_friend_count    integer
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
    -- Same predicate as list_profile_memories, by construction: a single
    -- can_view_owner_memories_on_profile check (owner-level) gates every
    -- row, then each row additionally requires an active, profile_visible
    -- participation. If the gate is false, every row is excluded, hence 0 --
    -- there is no path for this count to disagree with the row count the
    -- sibling RPC would return for the same (owner, viewer) pair.
    CASE
      WHEN public.can_view_owner_memories_on_profile(p.id, auth.uid()) THEN (
        SELECT COUNT(*)::integer
        FROM public.memory_participants mp
        WHERE mp.user_id = p.id
          AND mp.left_at IS NULL
          AND mp.profile_visible = true
      )
      ELSE 0
    END AS visible_memory_count,
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

-- Explicit, not assumed -- restated so this function's access is
-- self-evident from this migration alone, matching every other Privacy v1
-- RPC and the prior get_public_profile migrations.
REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
