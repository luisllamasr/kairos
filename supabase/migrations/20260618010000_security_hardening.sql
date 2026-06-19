-- =============================================================================
-- Migration: 20260618010000_security_hardening
-- Addresses findings from Supabase Security Advisor.
--
-- Changes applied:
--   1. handle_updated_at()  — add SET search_path to prevent search path injection
--   2. avatars SELECT policy — restrict Storage API listing to owner; CDN URLs unaffected
--   3. handle_new_user()   — revoke EXECUTE from PUBLIC; trigger is unaffected
--
-- Items deliberately NOT changed:
--   rls_auto_enable()      — Supabase-internal function, not owned by this project
--   Leaked password check  — irrelevant; Kairos uses OTP only (no passwords)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Lock search_path on handle_updated_at()
--
--    Without SET search_path, a crafted session search path could redirect
--    unqualified references inside the function to shadow objects in a rogue
--    schema. Adding SET search_path = public eliminates this vector.
--    The function body is unchanged — this is a declaration-only hardening.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. Tighten the avatars Storage SELECT policy to prevent user ID enumeration
--
--    The previous "avatars_public_read" policy allowed any caller (including
--    anonymous) to list all objects in the avatars bucket via the Storage API.
--    Since our path convention is {user_id}/avatar.jpg, this exposed every
--    registered user's ID through a simple list call.
--
--    New policy: only authenticated users can query metadata for their own files.
--
--    Avatar display in the app is NOT affected:
--      getPublicUrl() returns CDN URLs (/storage/v1/object/public/...) which
--      bypass storage.objects RLS entirely. Anyone with the URL can still view
--      the image. They just cannot enumerate URLs they don't already know.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

CREATE POLICY "avatars_read_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- -----------------------------------------------------------------------------
-- 3. Revoke EXECUTE on handle_new_user() from PUBLIC
--
--    PostgreSQL grants EXECUTE to PUBLIC by default for new functions.
--    handle_new_user() is SECURITY DEFINER (runs as postgres), so any role
--    with EXECUTE could call it with elevated privileges.
--
--    It is designed to be called only by the on_auth_user_created trigger.
--    Triggers invoke functions through an internal path that does not check
--    EXECUTE permissions on the function — they use the trigger owner's access.
--    Revoking from PUBLIC has zero effect on the trigger's behavior.
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
