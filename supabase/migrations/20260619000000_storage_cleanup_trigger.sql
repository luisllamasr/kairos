-- Migration: pg_net trigger → cleanup-user-storage Edge Function
--
-- Deletion chain (complete):
--   DELETE auth.users
--   → ON DELETE CASCADE → DELETE public.profiles  (same transaction)
--   → AFTER DELETE trigger fires                   (same transaction)
--   → net.http_post() queues HTTP request          (committed with transaction)
--   → transaction commits; user/profile are gone
--   → pg_net worker sends POST to cleanup-user-storage Edge Function
--   → Edge Function calls Storage API to delete avatar files
--
-- Key property: pg_net sends the HTTP request AFTER the transaction commits.
-- Profile deletion never blocks on, or is rolled back by, a cleanup failure.
-- This is the fundamental difference from the reverted trigger in 20260618020000,
-- which tried to delete storage.objects synchronously inside the transaction.
--
-- ── ONE-TIME SETUP ────────────────────────────────────────────────────────────
-- Run these two statements in Supabase Dashboard → SQL Editor.
-- Do NOT add them to this migration file — they contain project secrets.
--
--   1. Store the service role key in Supabase Vault (encrypted at rest):
--
--      SELECT vault.create_secret(
--        'service_role_key',
--        '<your-service-role-key>'      -- Dashboard → Settings → API → service_role
--      );
--
--   2. Store the Supabase project URL in Vault (same mechanism as step 1):
--
--      SELECT vault.create_secret(
--        'supabase_url',
--        'https://<project-ref>.supabase.co'  -- your EXPO_PUBLIC_SUPABASE_URL value
--      );
--
--      (ALTER DATABASE SET app.settings.* is not permitted in Supabase — use Vault.)
--
-- After running both commands, apply this migration, then verify:
--   • Delete a test user in Dashboard → Authentication → Users
--   • Check: Dashboard → Edge Functions → cleanup-user-storage → Logs
--   • Check: Dashboard → Storage → avatars (user folder should be gone)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_storage_cleanup_on_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text;
  _supabase_url     text;
BEGIN
  -- Read the service role key from Vault (encrypted).
  -- Vault is available on all Supabase projects and accessible to the postgres role.
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- Read the project URL from Vault (same pattern as the service role key).
  -- ALTER DATABASE SET app.settings.* is not permitted in Supabase, so both
  -- values are stored in Vault via vault.create_secret() — see setup above.
  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  -- If either is missing, log and skip rather than failing the deletion.
  -- This is the correct fallback: the user is deleted, files stay orphaned
  -- (visible in Edge Function logs) rather than the deletion being blocked.
  IF _service_role_key IS NULL OR _supabase_url IS NULL THEN
    RAISE WARNING
      '[storage-cleanup] Not configured — skipping cleanup for profile %. '
      'Run the two setup SQL commands documented in migration 20260619000000.',
      OLD.id;
    RETURN OLD;
  END IF;

  -- Queue the HTTP request. pg_net sends it after this transaction commits,
  -- so the Edge Function never runs inside the deletion transaction.
  PERFORM net.http_post(
    url     := _supabase_url || '/functions/v1/cleanup-user-storage',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body    := jsonb_build_object(
      'type',       'DELETE',
      'table',      'profiles',
      'schema',     'public',
      'record',     NULL,
      'old_record', jsonb_build_object('id', OLD.id)
    )
  );

  RETURN OLD;
END;
$$;

-- The trigger is the only intended caller — revoke direct invocation.
REVOKE EXECUTE ON FUNCTION public.trigger_storage_cleanup_on_profile_delete() FROM PUBLIC;

CREATE TRIGGER on_profile_deleted_cleanup_storage
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_storage_cleanup_on_profile_delete();
