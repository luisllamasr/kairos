-- Migration: clean up avatar storage when a profile is deleted.
--
-- Deletion chain:
--   DELETE auth.users
--   → ON DELETE CASCADE removes public.profiles
--   → this trigger removes storage.objects owned by that user
--
-- This prevents orphaned files in the avatars bucket when an account is
-- deleted (manually, or by the future 30-day incomplete-profile cleanup job).
--
-- Path convention: {user_id}/avatar.jpg
-- The foldername check targets the entire user "folder" so any future
-- files added under {user_id}/ in the avatars bucket are also cleaned up.

CREATE OR REPLACE FUNCTION public.handle_profile_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = OLD.id::text;
  RETURN OLD;
END;
$$;

-- The trigger is the only intended caller — revoke direct invocation.
REVOKE EXECUTE ON FUNCTION public.handle_profile_deleted() FROM PUBLIC;

CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_deleted();
