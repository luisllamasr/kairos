-- Migration: revert the profile storage cleanup trigger.
--
-- The previous migration (20260618020000) attempted to clean up avatar files
-- by deleting directly from storage.objects in an AFTER DELETE trigger.
--
-- This is not the supported Supabase pattern:
--   - storage.objects is a Supabase-internal table with its own service triggers.
--     Deleting from it inside a cascade chain fails because those internal
--     triggers expect the Storage API execution context (active session,
--     auth.uid() present, S3 worker available), which does not exist in a
--     PostgreSQL trigger.
--   - Using EXCEPTION WHEN OTHERS to swallow the failure is not acceptable
--     because it would produce silent orphaned files with no guaranteed cleanup.
--   - The intended interface for file deletion is the Storage API:
--     supabase.storage.from('avatars').remove([path])
--
-- Current state:
--   Users cannot delete their own accounts from Kairos yet. Storage cleanup
--   only affects manual dashboard operations during development. Adding a
--   broken or silent-fail trigger for a non-existent user flow is premature.
--
-- Implemented solution (migration 20260619000000):
--   A pg_net trigger on public.profiles fires AFTER DELETE and asynchronously
--   calls the cleanup-user-storage Edge Function via net.http_post(). The Edge
--   Function uses the Storage API to remove user files. Because pg_net sends the
--   request after the transaction commits, cleanup failures never block or roll
--   back account deletion.

DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_profile_deleted();
