-- Migration: memories storage policy hardening + bucket config sync
--
-- 1. Ensure private bucket with allowed jpeg/png/webp (idempotent upsert).
-- 2. Qualify storage.objects.name in RLS — unqualified `name` inside subqueries
--    can bind to the wrong column (Supabase storage RLS gotcha).
-- 3. Re-assert is_active_memory_participant EXECUTE for authenticated uploads.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memories',
  'memories',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "memories_participant_select" ON storage.objects;
DROP POLICY IF EXISTS "memories_participant_insert" ON storage.objects;
DROP POLICY IF EXISTS "memories_uploader_or_leader_delete" ON storage.objects;

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

GRANT EXECUTE ON FUNCTION public.is_active_memory_participant(uuid, uuid) TO authenticated;
