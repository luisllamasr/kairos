-- =============================================================================
-- Realtime Authorization for experience chat channels
--
-- Prepares the two experience-chat Realtime channels to run as PRIVATE channels
-- (`config: { private: true }`), authorized by RLS on `realtime.messages`:
--
--   experience-chat:{experienceId}
--       Existing channel carrying `postgres_changes` for chat messages and
--       reactions. A private channel needs a read policy to be joinable at all.
--       Receive requires `chat_read`.
--
--   experience-chat-signals:{experienceId}
--       New ephemeral Broadcast channel (typing indicator, future ephemeral
--       signals). Receive requires `chat_read`; send requires `chat_write`, so a
--       `leader_only` chat only lets the organizer broadcast.
--
-- All checks reuse the existing `experience_user_can(uuid, text)` helper
-- (participation + lifecycle floor + chat policy). Nothing about participants,
-- experiences or that helper changes here.
--
-- Verified live against the dev project before this migration was written
-- (see scripts/realtime-auth-spike/ and docs/SECURITY.md → Realtime
-- authorization): private join/deny, public-vs-private topic isolation,
-- `leader_only` write denial, and revocation on token refresh.
--
-- Do NOT add `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY`: RLS is
-- already enabled and Supabase-owned, and the statement fails with
-- "must be owner". Policies themselves can be created by `postgres`.
--
-- Dashboard follow-up (not SQL): once every client uses private channels, turn
-- OFF Realtime Settings → "Allow public access to channels" so the project is
-- fail-closed. Until then public channels still work, which keeps older client
-- builds functional.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Strict topic parser
-- ---------------------------------------------------------------------------
-- Returns the experience id for a topic that is EXACTLY '<prefix>:<uuid>' with a
-- canonical lowercase UUID, otherwise NULL. Never raises: the ::uuid cast sits
-- inside a CASE branch that is only reached after the regex has matched.
-- A NULL id makes experience_user_can() return false, so malformed, differently
-- cased, suffixed or foreign-prefix topics are all denied.

CREATE OR REPLACE FUNCTION public.experience_id_from_realtime_topic(
  p_prefix text,
  p_topic  text
)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_prefix IS NOT NULL
     AND p_topic  IS NOT NULL
     AND p_topic ~ '^[a-z][a-z-]*:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND split_part(p_topic, ':', 1) = p_prefix
    THEN split_part(p_topic, ':', 2)::uuid
  END;
$$;

COMMENT ON FUNCTION public.experience_id_from_realtime_topic(text, text) IS
  'Realtime topic parser: ''<prefix>:<canonical lowercase uuid>'' -> uuid, else NULL. Used by realtime.messages policies.';

REVOKE ALL ON FUNCTION public.experience_id_from_realtime_topic(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.experience_id_from_realtime_topic(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. realtime.messages policies (idempotent)
-- ---------------------------------------------------------------------------
-- Only the `broadcast` extension is matched. Presence is intentionally NOT
-- granted: it stays denied until a feature needs it and gets its own policy.
-- `(SELECT realtime.topic())` is wrapped so Postgres evaluates it once per
-- statement instead of per row.

DROP POLICY IF EXISTS "experience_chat_channel_read" ON realtime.messages;
CREATE POLICY "experience_chat_channel_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND public.experience_user_can(
      public.experience_id_from_realtime_topic('experience-chat', (SELECT realtime.topic())),
      'chat_read'
    )
  );

DROP POLICY IF EXISTS "experience_chat_signals_read" ON realtime.messages;
CREATE POLICY "experience_chat_signals_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND public.experience_user_can(
      public.experience_id_from_realtime_topic('experience-chat-signals', (SELECT realtime.topic())),
      'chat_read'
    )
  );

DROP POLICY IF EXISTS "experience_chat_signals_write" ON realtime.messages;
CREATE POLICY "experience_chat_signals_write"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND public.experience_user_can(
      public.experience_id_from_realtime_topic('experience-chat-signals', (SELECT realtime.topic())),
      'chat_write'
    )
  );