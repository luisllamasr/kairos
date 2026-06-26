-- Migration: shared experiences schema (milestone 14 — phase 1)
--
-- Participants, invitations, suggestions, per-experience decline limits,
-- edit_info_policy, FK hardening, profile-delete handler, backfill.

-- -----------------------------------------------------------------------------
-- 1. Experience columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS edit_info_policy public.memory_permission_policy
    NOT NULL DEFAULT 'all_participants';

COMMENT ON COLUMN public.experiences.edit_info_policy IS
  'Who may edit shared plan content (title, description, location). Lifecycle actions stay organizer-only.';

-- -----------------------------------------------------------------------------
-- 2. Enums + tables
-- -----------------------------------------------------------------------------

CREATE TYPE public.experience_invitation_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TYPE public.experience_invite_suggestion_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.experience_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id       UUID NOT NULL,
  user_id             UUID NOT NULL,
  role                public.memory_participant_role NOT NULL DEFAULT 'participant',
  notifications_muted BOOLEAN NOT NULL DEFAULT false,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT experience_participants_experience_fkey
    FOREIGN KEY (experience_id) REFERENCES public.experiences (id) ON DELETE CASCADE,

  CONSTRAINT experience_participants_user_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX experience_participants_experience_user_uidx
  ON public.experience_participants (experience_id, user_id);

CREATE INDEX experience_participants_user_idx
  ON public.experience_participants (user_id, experience_id);

CREATE INDEX experience_participants_experience_idx
  ON public.experience_participants (experience_id);

COMMENT ON TABLE public.experience_participants IS
  'Accepted participants only. Leave or leader remove = DELETE row (no tombstone).';

CREATE TABLE public.experience_invite_suggestions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id       UUID NOT NULL,
  suggested_by        UUID NOT NULL,
  suggested_user_id   UUID NOT NULL,
  status              public.experience_invite_suggestion_status NOT NULL DEFAULT 'pending',
  reviewed_by         UUID,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT experience_invite_suggestions_experience_fkey
    FOREIGN KEY (experience_id) REFERENCES public.experiences (id) ON DELETE CASCADE,

  CONSTRAINT experience_invite_suggestions_suggested_by_fkey
    FOREIGN KEY (suggested_by) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experience_invite_suggestions_suggested_user_fkey
    FOREIGN KEY (suggested_user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experience_invite_suggestions_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX experience_invite_suggestions_pending_uidx
  ON public.experience_invite_suggestions (experience_id, suggested_user_id)
  WHERE status = 'pending';

CREATE TABLE public.experience_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id   UUID NOT NULL,
  invitee_id      UUID NOT NULL,
  invited_by      UUID NOT NULL,
  suggestion_id   UUID,
  status          public.experience_invitation_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,

  CONSTRAINT experience_invitations_experience_fkey
    FOREIGN KEY (experience_id) REFERENCES public.experiences (id) ON DELETE CASCADE,

  CONSTRAINT experience_invitations_invitee_fkey
    FOREIGN KEY (invitee_id) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experience_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experience_invitations_suggestion_fkey
    FOREIGN KEY (suggestion_id) REFERENCES public.experience_invite_suggestions (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX experience_invitations_pending_uidx
  ON public.experience_invitations (experience_id, invitee_id)
  WHERE status = 'pending';

CREATE INDEX experience_invitations_invitee_pending_idx
  ON public.experience_invitations (invitee_id, created_at DESC)
  WHERE status = 'pending';

CREATE TABLE public.experience_invite_declines (
  experience_id  UUID NOT NULL,
  invitee_id     UUID NOT NULL,
  decline_count  INTEGER NOT NULL DEFAULT 0,
  blocked_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT experience_invite_declines_pkey
    PRIMARY KEY (experience_id, invitee_id),

  CONSTRAINT experience_invite_declines_experience_fkey
    FOREIGN KEY (experience_id) REFERENCES public.experiences (id) ON DELETE CASCADE,

  CONSTRAINT experience_invite_declines_invitee_fkey
    FOREIGN KEY (invitee_id) REFERENCES public.profiles (id) ON DELETE CASCADE,

  CONSTRAINT experience_invite_declines_count_valid
    CHECK (decline_count >= 0 AND decline_count <= 3)
);

COMMENT ON TABLE public.experience_invite_declines IS
  'Per-experience invite decline counter. blocked_at set after 3 declines for same invitee on same plan.';

-- -----------------------------------------------------------------------------
-- 3. Harden experience profile FKs (shared plans must not CASCADE-delete)
-- -----------------------------------------------------------------------------

ALTER TABLE public.experiences
  DROP CONSTRAINT IF EXISTS experiences_created_by_fkey;

ALTER TABLE public.experiences
  ADD CONSTRAINT experiences_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.experiences
  DROP CONSTRAINT IF EXISTS experiences_organizer_id_fkey;

ALTER TABLE public.experiences
  ALTER COLUMN organizer_id DROP NOT NULL;

ALTER TABLE public.experiences
  ADD CONSTRAINT experiences_organizer_id_fkey
    FOREIGN KEY (organizer_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 4. Backfill organizer as sole participant (existing M12 rows)
-- -----------------------------------------------------------------------------

INSERT INTO public.experience_participants (experience_id, user_id, role, joined_at)
SELECT e.id, e.organizer_id, 'organizer', e.created_at
FROM public.experiences e
WHERE e.organizer_id IS NOT NULL
ON CONFLICT (experience_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Internal helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_experience_participant(
  p_experience_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
      AND ep.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_experience_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_experience_participant(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.are_accepted_friends(
  p_user_a uuid,
  p_user_b uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND f.user_low_id = LEAST(p_user_a, p_user_b)
      AND f.user_high_id = GREATEST(p_user_a, p_user_b)
  );
$$;

REVOKE ALL ON FUNCTION public.are_accepted_friends(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.experience_invites_allowed(p_experience_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.experiences e
    WHERE e.id = p_experience_id
      AND e.status = 'planned'
      AND e.starts_at > NOW()
  );
$$;

REVOKE ALL ON FUNCTION public.experience_invites_allowed(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.is_experience_invite_blocked(
  p_experience_id uuid,
  p_invitee_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT d.blocked_at IS NOT NULL
      FROM public.experience_invite_declines d
      WHERE d.experience_id = p_experience_id
        AND d.invitee_id = p_invitee_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_experience_invite_blocked(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.elect_experience_organizer(
  p_experience_id uuid,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ep.user_id
  FROM public.experience_participants ep
  WHERE ep.experience_id = p_experience_id
    AND (p_exclude_user_id IS NULL OR ep.user_id <> p_exclude_user_id)
  ORDER BY ep.joined_at ASC, ep.user_id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.elect_experience_organizer(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.purge_experience_if_orphaned(p_experience_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.experience_participants ep
    WHERE ep.experience_id = p_experience_id
  ) THEN
    RETURN;
  END IF;

  DELETE FROM public.experiences WHERE id = p_experience_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_experience_if_orphaned(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_experience_invite_decline(
  p_experience_id uuid,
  p_invitee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.experience_invite_declines (experience_id, invitee_id, decline_count, updated_at)
  VALUES (p_experience_id, p_invitee_id, 1, NOW())
  ON CONFLICT (experience_id, invitee_id) DO UPDATE
  SET
    decline_count = LEAST(experience_invite_declines.decline_count + 1, 3),
    updated_at = NOW(),
    blocked_at = CASE
      WHEN experience_invite_declines.decline_count + 1 >= 3 THEN NOW()
      ELSE experience_invite_declines.blocked_at
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_experience_invite_decline(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cancel_experience_pending_invites(p_experience_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.experience_invitations
  SET status = 'declined', responded_at = NOW()
  WHERE experience_id = p_experience_id
    AND status = 'pending';

  UPDATE public.experience_invite_suggestions
  SET status = 'rejected', reviewed_at = NOW()
  WHERE experience_id = p_experience_id
    AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_experience_pending_invites(uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 6. Account delete — experiences (no tombstone on participants)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_profile_delete_experiences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp_id uuid;
  v_new_org uuid;
  v_affected uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT ep.experience_id), ARRAY[]::uuid[])
  INTO v_affected
  FROM public.experience_participants ep
  WHERE ep.user_id = OLD.id;

  FOR v_exp_id IN
    SELECT e.id FROM public.experiences e WHERE e.organizer_id = OLD.id
  LOOP
    v_new_org := public.elect_experience_organizer(v_exp_id, OLD.id);
    UPDATE public.experiences SET organizer_id = v_new_org WHERE id = v_exp_id;
  END LOOP;

  DELETE FROM public.experience_invitations
  WHERE invitee_id = OLD.id OR invited_by = OLD.id;

  DELETE FROM public.experience_invite_suggestions
  WHERE suggested_by = OLD.id OR suggested_user_id = OLD.id;

  DELETE FROM public.experience_participants WHERE user_id = OLD.id;

  IF v_affected IS NOT NULL THEN
    FOREACH v_exp_id IN ARRAY v_affected
    LOOP
      PERFORM public.purge_experience_if_orphaned(v_exp_id);
    END LOOP;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_profile_delete_experiences() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_profile_delete_experiences ON public.profiles;

CREATE TRIGGER on_profile_delete_experiences
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_delete_experiences();

-- -----------------------------------------------------------------------------
-- 7. Grants + RLS
-- -----------------------------------------------------------------------------

GRANT SELECT ON TABLE public.experience_participants TO authenticated;
GRANT SELECT ON TABLE public.experience_invitations TO authenticated;
GRANT SELECT ON TABLE public.experience_invite_suggestions TO authenticated;

ALTER TABLE public.experience_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_invite_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "experiences_select_participant" ON public.experiences;

CREATE POLICY "experiences_select_participant"
  ON public.experiences
  FOR SELECT
  TO authenticated
  USING (public.is_experience_participant(id));

CREATE POLICY "experience_participants_select_fellow"
  ON public.experience_participants
  FOR SELECT
  TO authenticated
  USING (public.is_experience_participant(experience_id));

CREATE POLICY "experience_invitations_select_invitee"
  ON public.experience_invitations
  FOR SELECT
  TO authenticated
  USING (
    invitee_id = auth.uid()
    OR public.is_experience_participant(experience_id)
  );

CREATE POLICY "experience_invite_suggestions_select_participant"
  ON public.experience_invite_suggestions
  FOR SELECT
  TO authenticated
  USING (
    public.is_experience_participant(experience_id)
    OR suggested_user_id = auth.uid()
  );
