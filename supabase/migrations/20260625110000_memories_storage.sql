-- Migration: memories storage bucket (milestone 13)
--
-- Private bucket — participants only. Path: memories/{memory_id}/{media_id}.{ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memories',
  'memories',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "memories_participant_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'memories'
    AND public.is_active_memory_participant((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "memories_participant_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'memories'
    AND public.is_active_memory_participant((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "memories_uploader_or_leader_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'memories'
    AND public.is_active_memory_participant((storage.foldername(name))[1]::uuid)
    AND (
      (storage.foldername(name))[2] IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.memory_media mm
        WHERE mm.storage_path = name
          AND mm.uploaded_by_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.memories m
        WHERE m.id = (storage.foldername(name))[1]::uuid
          AND m.leader_id = auth.uid()
      )
    )
  );
