-- Migration: dedicated single-message reaction read RPC (post-M15 hardening)
--
-- Reacting to (or receiving a realtime reaction update for) one message
-- previously refetched up to 100 whole messages via list_experience_messages
-- just to read back one message's reactions array. This RPC reads exactly
-- what's needed. RLS on experience_message_reactions (participant-only,
-- 20260703100000) still applies — SECURITY INVOKER, same as
-- list_experience_messages, so a non-participant simply gets an empty array
-- rather than an error, matching existing read-RPC behavior.

CREATE OR REPLACE FUNCTION public.get_experience_message_reactions(p_message_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', r.user_id,
        'emoji', r.emoji,
        'created_at', r.created_at
      )
      ORDER BY r.created_at ASC, r.user_id ASC
    ),
    '[]'::jsonb
  )
  FROM public.experience_message_reactions r
  WHERE r.message_id = p_message_id;
$$;

REVOKE ALL ON FUNCTION public.get_experience_message_reactions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_experience_message_reactions(uuid) TO authenticated;
