-- Migration: scheduled cleanup for abandoned incomplete onboarding signups
--
-- Replaces the documented 30-day contract in 20260617000000 with a 3-day rule:
--   Candidates: public.profiles WHERE username IS NULL
--               AND created_at < NOW() - INTERVAL '3 days'
--   Action:     cleanup-incomplete-signups Edge Function → auth.admin.deleteUser(id)
--   Result:     ON DELETE CASCADE removes profile; pg_net → cleanup-user-storage
--
-- Prerequisites (same Vault secrets as migration 20260619000000):
--   vault.create_secret('service_role_key', ...)
--   vault.create_secret('supabase_url', ...)
--
-- Deploy: supabase functions deploy cleanup-incomplete-signups
--
-- Manual test (Dashboard → Edge Functions → Invoke):
--   ?dry_run=1                          — list candidates, no deletes
--   Backdate test row, then invoke      — see function header comments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Wrapper so pg_cron can invoke the Edge Function without hardcoding secrets.
CREATE OR REPLACE FUNCTION public.trigger_incomplete_signup_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text;
  _supabase_url     text;
BEGIN
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  IF _service_role_key IS NULL OR _supabase_url IS NULL THEN
    RAISE WARNING
      '[incomplete-signup-cleanup] Vault not configured — skipping. '
      'Run vault.create_secret setup documented in migration 20260619000000.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := _supabase_url || '/functions/v1/cleanup-incomplete-signups',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_incomplete_signup_cleanup() FROM PUBLIC;

-- Idempotent reschedule: remove previous job name if this migration is re-applied.
DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id
  FROM cron.job
  WHERE jobname = 'cleanup-incomplete-signups-daily';

  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;
END;
$$;

-- Daily at 03:15 UTC — staggered from typical on-the-hour jobs.
SELECT cron.schedule(
  'cleanup-incomplete-signups-daily',
  '15 3 * * *',
  $$SELECT public.trigger_incomplete_signup_cleanup()$$
);
