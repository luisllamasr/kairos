-- Create the avatars storage bucket.
-- Public bucket: profile photos are public data — no signed URLs needed for display.
-- File size: 5 MB cap. Types: JPEG, PNG, WebP (standard mobile image formats).
--
-- Path convention: avatars/{user_id}/avatar.jpg
-- The first path segment must equal the uploading user's ID.
-- This prevents users from overwriting each other's files.
--
-- This bucket also validates the Storage architecture that will be reused
-- for experience photos (experiences/{experience_id}/...) and memories.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view profile photos (bucket is already public, but explicit policy is safer).
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated insert: owner can create their own avatar file.
CREATE POLICY "avatars_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner update: owner can overwrite their own avatar (upsert support).
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner delete: owner can remove their own avatar.
CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
