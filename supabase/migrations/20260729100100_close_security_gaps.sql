-- Migration: close security gaps (post-M15 production-readiness audit)
--
-- 1. Notifications: clients held a direct table UPDATE grant, and RLS
--    (`notifications_update_own`) only enforced row ownership, not column
--    scope. Any authenticated user could rewrite `type` / `payload` /
--    `actor_id` / `read_at` on their own rows directly via PostgREST,
--    bypassing mark_notification_read()'s intended one-directional,
--    single-column semantics. No client code uses the direct grant today —
--    every notification write already goes through the RPC — so this closes
--    unused, unintended surface with no client changes required.
--
-- 2. Memory storage uploads: the INSERT policy on `storage.objects` checked
--    only active participation, not `memories.add_media_policy`
--    (leader_only vs all_participants), unlike register_memory_photo(),
--    which does enforce it. A participant could upload a file directly to
--    storage even when the memory's policy is leader_only. Storage RLS now
--    mirrors register_memory_photo()'s policy check exactly.

-- 1. Notifications — remove direct client UPDATE; all writes via RPC.
REVOKE UPDATE ON TABLE public.notifications FROM authenticated;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;

-- 2. Memory storage uploads — enforce add_media_policy at the storage layer.
DROP POLICY IF EXISTS "memories_participant_insert" ON storage.objects;

CREATE POLICY "memories_participant_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'memories'
    AND public.is_active_memory_participant(
      (storage.foldername(objects.name))[1]::uuid
    )
    AND EXISTS (
      SELECT 1 FROM public.memories m
      WHERE m.id = (storage.foldername(objects.name))[1]::uuid
        AND (
          m.add_media_policy = 'all_participants'
          OR m.leader_id = auth.uid()
        )
    )
  );
