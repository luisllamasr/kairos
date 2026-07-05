-- Migration: experience chat schema (milestone 15.1)
--
-- Product rules:
--   • Chat scoped to one experience; CASCADE when experience DELETEs (transform, purge, delete).
--   • Accepted participants only (RLS via is_experience_participant).
--   • chat_policy reuses memory_permission_policy enum.
--   • RPC-only writes in M15.2 — SELECT + Realtime publication here.
--   • send_experience_message (M15.2) must FOR UPDATE parent experience before INSERT
--     (see PROJECT.md "Transform vs send race").

-- -----------------------------------------------------------------------------
-- 1. Experience chat policy column
-- -----------------------------------------------------------------------------

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS chat_policy public.memory_permission_policy
    NOT NULL DEFAULT 'all_participants';

COMMENT ON COLUMN public.experiences.chat_policy IS
  'Who may send experience chat messages. Read access stays participant-only regardless of policy.';

-- -----------------------------------------------------------------------------
-- 2. Chat tables
-- -----------------------------------------------------------------------------

CREATE TABLE public.experience_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL,
  author_id     UUID,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT experience_messages_experience_fkey
    FOREIGN KEY (experience_id) REFERENCES public.experiences (id) ON DELETE CASCADE,

  CONSTRAINT experience_messages_author_fkey
    FOREIGN KEY (author_id) REFERENCES public.profiles (id) ON DELETE SET NULL,

  CONSTRAINT experience_messages_body_length
    CHECK (char_length(trim(body)) >= 1 AND char_length(body) <= 2000)
);

CREATE INDEX experience_messages_experience_created_idx
  ON public.experience_messages (experience_id, created_at DESC, id DESC);

COMMENT ON TABLE public.experience_messages IS
  'Ephemeral coordination chat for one experience. Purged when experience row DELETEs.';

CREATE TABLE public.experience_message_reactions (
  message_id UUID NOT NULL,
  user_id    UUID NOT NULL,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT experience_message_reactions_pkey
    PRIMARY KEY (message_id, user_id),

  CONSTRAINT experience_message_reactions_message_fkey
    FOREIGN KEY (message_id) REFERENCES public.experience_messages (id) ON DELETE CASCADE,

  CONSTRAINT experience_message_reactions_user_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experience_message_reactions_emoji_allowlist
    CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏'))
);

CREATE INDEX experience_message_reactions_message_idx
  ON public.experience_message_reactions (message_id);

COMMENT ON TABLE public.experience_message_reactions IS
  'One reaction per user per message; emoji allowlist enforced at DB + RPC layer.';

-- -----------------------------------------------------------------------------
-- 3. Shared permission helper (internal)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.experience_user_can(
  p_experience_id uuid,
  p_capability  text,
  p_user_id     uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp public.experiences%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, p_user_id) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_exp
  FROM public.experiences e
  WHERE e.id = p_experience_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  CASE p_capability
    WHEN 'edit_info' THEN
      RETURN v_exp.status = 'planned'
        AND v_exp.transform_at > NOW()
        AND (
          v_exp.edit_info_policy = 'all_participants'
          OR v_exp.organizer_id = p_user_id
        );

    WHEN 'chat_write' THEN
      RETURN v_exp.status IN ('planned', 'cancelled')
        AND (
          v_exp.chat_policy = 'all_participants'
          OR v_exp.organizer_id = p_user_id
        );

    WHEN 'chat_react' THEN
      RETURN v_exp.status IN ('planned', 'cancelled');

    ELSE
      RETURN false;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.experience_user_can(uuid, text, uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 4. Grants + RLS (SELECT only — writes via M15.2 RPCs)
-- -----------------------------------------------------------------------------

GRANT SELECT ON TABLE public.experience_messages TO authenticated;
GRANT SELECT ON TABLE public.experience_message_reactions TO authenticated;

ALTER TABLE public.experience_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experience_messages_select_participant"
  ON public.experience_messages
  FOR SELECT
  TO authenticated
  USING (public.is_experience_participant(experience_id));

CREATE POLICY "experience_message_reactions_select_participant"
  ON public.experience_message_reactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_experience_participant(
      (
        SELECT m.experience_id
        FROM public.experience_messages m
        WHERE m.id = experience_message_reactions.message_id
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Realtime publication
-- -----------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.experience_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.experience_message_reactions;
