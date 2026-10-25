-- =============================================================================
-- Reaction changes over database-triggered, topic-authorized Broadcast
--
-- Problem (confirmed live on the dev project): `experience_message_reactions` was
-- in the `supabase_realtime` publication and the app bound it unfiltered through
-- `postgres_changes`. Realtime applies table RLS to INSERT/UPDATE, but NOT to
-- DELETE (the old row no longer exists to check), so every reaction removal
-- (`message_id` + `user_id`, the primary key) was delivered to ANY subscriber of
-- the table. Channel authorization does not help: it is per topic, while a
-- `postgres_changes` binding is table-level and chosen by the client, so any
-- authenticated user can bind the table from a topic they are legitimately
-- allowed to join (for example their own experience's chat topic). Making the
-- channel private therefore never closed this, and a client-only change cannot
-- either.
--
-- Fix:
--   1. Remove the table from the publication, so no `postgres_changes` binding
--      on it can deliver anything to anyone.
--   2. An AFTER INSERT/UPDATE/DELETE row trigger sends a private Broadcast
--      `reaction_changed` to `experience-chat:{experience_id}`. Receiving that
--      topic already requires `chat_read` through the existing policy
--      `experience_chat_channel_read` (20260803140000); clients have no INSERT
--      policy on it, so only this trigger can publish there.
--   3. The payload is `{ message_id }` only. Clients already refetch the
--      reactions of that message through `get_experience_message_reactions`
--      (INVOKER + RLS), so no user id or emoji needs to travel in the event.
--      (`realtime.send` adds a random `id` of the broadcast row itself.)
--
-- Notes:
--   * `realtime.send` swallows its own errors (RAISE WARNING), so a failed
--     broadcast can never break writing a reaction.
--   * If the parent message no longer exists (the reaction row is being removed
--     by the FK cascade of a message or experience delete), there is no topic to
--     address and nothing is sent; the messages binding and the refetch cover
--     that case.
--   * `realtime.send` runs `SET LOCAL realtime.topic` for the rest of the
--     transaction; nothing here relies on that setting.
--   * Rollout: clients that still bind the reactions table will get a channel
--     error once the table leaves the publication. Ship the client change
--     (listen for `reaction_changed`, no reactions table binding) together with,
--     or just before, this migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_experience_reaction_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message_id    uuid;
  v_experience_id uuid;
BEGIN
  v_message_id := CASE TG_OP WHEN 'DELETE' THEN OLD.message_id ELSE NEW.message_id END;

  SELECT m.experience_id
  INTO v_experience_id
  FROM public.experience_messages m
  WHERE m.id = v_message_id;

  -- NULL: the parent message is already gone (cascade). Nobody to address.
  IF v_experience_id IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('message_id', v_message_id),
      'reaction_changed',
      'experience-chat:' || v_experience_id::text,
      true
    );
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.broadcast_experience_reaction_change() IS
  'Row trigger on experience_message_reactions: private Broadcast reaction_changed {message_id} to experience-chat:{experience_id}. Replaces the unfiltered postgres_changes binding (its DELETE events bypass RLS).';

-- Trigger functions are not called through the API; nobody but the owner needs EXECUTE.
REVOKE ALL ON FUNCTION public.broadcast_experience_reaction_change() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger (idempotent)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS experience_message_reactions_broadcast
  ON public.experience_message_reactions;

CREATE TRIGGER experience_message_reactions_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.experience_message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_experience_reaction_change();

-- ---------------------------------------------------------------------------
-- 3. Remove the table from the Realtime publication (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'experience_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.experience_message_reactions;
  END IF;
END;
$$;
