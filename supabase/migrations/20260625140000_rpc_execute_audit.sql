-- Migration: RPC EXECUTE grant audit (M13.5)
--
-- Tighten grants after Supabase Security Advisor review.
-- See docs/SECURITY.md for full rationale.

-- Helpers — internal / write-RPC only; not direct client RPCs.
REVOKE EXECUTE ON FUNCTION public.memory_has_active_participants(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.experience_min_starts_at() FROM authenticated;

-- Not called from app yet; re-grant when Profile memory count UI ships.
REVOKE EXECUTE ON FUNCTION public.count_my_memories() FROM authenticated;

-- Align with other friendship read RPCs (SECURITY INVOKER + friendships RLS).
CREATE OR REPLACE FUNCTION public.count_my_friends()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.friendships f
  WHERE f.status = 'accepted'
    AND (f.user_low_id = auth.uid() OR f.user_high_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.count_my_friends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_my_friends() TO authenticated;
