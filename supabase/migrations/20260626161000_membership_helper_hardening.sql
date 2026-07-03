-- Migration: P0 membership helper hardening
--
-- Close cross-user membership probing via /rest/v1/rpc on two-arg helper signatures.
-- Public one-arg overloads (caller-only) remain granted for RLS + Storage policies.
-- Two-arg overloads are internal — write RPCs call them as function owner.

-- -----------------------------------------------------------------------------
-- 1. is_experience_participant — add one-arg overload, rebind policies, split
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_experience_participant(p_experience_id uuid)
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
      AND ep.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "experiences_select_participant" ON public.experiences;
DROP POLICY IF EXISTS "experience_participants_select_fellow" ON public.experience_participants;
DROP POLICY IF EXISTS "experience_invitations_select_invitee" ON public.experience_invitations;
DROP POLICY IF EXISTS "experience_invite_suggestions_select_participant" ON public.experience_invite_suggestions;

DROP FUNCTION public.is_experience_participant(uuid, uuid);

CREATE FUNCTION public.is_experience_participant(
  p_experience_id uuid,
  p_user_id uuid
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

REVOKE ALL ON FUNCTION public.is_experience_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_experience_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_experience_participant(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. is_pending_experience_invitee
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_pending_experience_invitee(p_experience_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.experience_invitations i
    WHERE i.experience_id = p_experience_id
      AND i.invitee_id = auth.uid()
      AND i.status = 'pending'
  );
$$;

DROP POLICY IF EXISTS "experiences_select_pending_invitee" ON public.experiences;
DROP POLICY IF EXISTS "experience_participants_select_pending_invitee" ON public.experience_participants;

DROP FUNCTION public.is_pending_experience_invitee(uuid, uuid);

CREATE FUNCTION public.is_pending_experience_invitee(
  p_experience_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.experience_invitations i
    WHERE i.experience_id = p_experience_id
      AND i.invitee_id = p_user_id
      AND i.status = 'pending'
  );
$$;

CREATE POLICY "experiences_select_pending_invitee"
  ON public.experiences
  FOR SELECT
  TO authenticated
  USING (public.is_pending_experience_invitee(id));

CREATE POLICY "experience_participants_select_pending_invitee"
  ON public.experience_participants
  FOR SELECT
  TO authenticated
  USING (public.is_pending_experience_invitee(experience_id));

REVOKE ALL ON FUNCTION public.is_pending_experience_invitee(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_pending_experience_invitee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_pending_experience_invitee(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. is_active_memory_participant
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_memory_participant(p_memory_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_participants mp
    WHERE mp.memory_id = p_memory_id
      AND mp.user_id = auth.uid()
      AND mp.left_at IS NULL
  );
$$;

DROP POLICY IF EXISTS "memories_select_active_participant" ON public.memories;
DROP POLICY IF EXISTS "memory_participants_select_fellow" ON public.memory_participants;
DROP POLICY IF EXISTS "memory_media_select_participant" ON public.memory_media;
DROP POLICY IF EXISTS "memories_participant_select" ON storage.objects;
DROP POLICY IF EXISTS "memories_participant_insert" ON storage.objects;
DROP POLICY IF EXISTS "memories_uploader_or_leader_delete" ON storage.objects;

DROP FUNCTION public.is_active_memory_participant(uuid, uuid);

CREATE FUNCTION public.is_active_memory_participant(
  p_memory_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_participants mp
    WHERE mp.memory_id = p_memory_id
      AND mp.user_id = p_user_id
      AND mp.left_at IS NULL
  );
$$;

CREATE POLICY "memories_select_active_participant"
  ON public.memories
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(id));

CREATE POLICY "memory_participants_select_fellow"
  ON public.memory_participants
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(memory_id));

CREATE POLICY "memory_media_select_participant"
  ON public.memory_media
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(memory_id));

CREATE POLICY "memories_participant_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'memories'
    AND public.is_active_memory_participant(
      (storage.foldername(objects.name))[1]::uuid
    )
  );

CREATE POLICY "memories_participant_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'memories'
    AND public.is_active_memory_participant(
      (storage.foldername(objects.name))[1]::uuid
    )
  );

CREATE POLICY "memories_uploader_or_leader_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'memories'
    AND public.is_active_memory_participant(
      (storage.foldername(objects.name))[1]::uuid
    )
    AND (
      (storage.foldername(objects.name))[2] IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.memory_media mm
        WHERE mm.storage_path = objects.name
          AND mm.uploaded_by_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.memories m
        WHERE m.id = (storage.foldername(objects.name))[1]::uuid
          AND m.leader_id = auth.uid()
      )
    )
  );

REVOKE ALL ON FUNCTION public.is_active_memory_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_memory_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_memory_participant(uuid) TO authenticated;
